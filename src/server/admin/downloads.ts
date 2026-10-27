import "server-only";
import { randomUUID } from "node:crypto";
import { count, desc, eq, gt } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "../db";
import { assets, downloads, users, works } from "../db/schema";
import { candidateSizes, lookupWatermark } from "../downloads";
import { downloadEnv } from "../env";
import { deleteObjects, getObjectBuffer, presignUpload, safeFilename } from "../storage";
import { findWatermark } from "../watermark";
import { audit } from "./audit";
import { ServiceError } from "./errors";

export async function listDownloads(limit = 500) {
  const db = getDb();
  const [rows, heavy] = await Promise.all([
    db
      .select({
        id: downloads.id,
        createdAt: downloads.createdAt,
        watermark: downloads.watermark,
        reused: downloads.derivedKey,
        kind: downloads.kind,
        ipHash: downloads.ipHash,
        userId: users.id,
        userName: users.name,
        filename: assets.filename,
        workTitle: works.title,
        workId: works.id,
      })
      .from(downloads)
      .leftJoin(users, eq(downloads.userId, users.id))
      .leftJoin(assets, eq(downloads.assetId, assets.id))
      .leftJoin(works, eq(assets.workId, works.id))
      .orderBy(desc(downloads.createdAt))
      .limit(limit),
    db
      .select({ userId: downloads.userId, count: count() })
      .from(downloads)
      .where(gt(downloads.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .groupBy(downloads.userId),
  ]);
  return { rows, perUserToday: new Map(heavy.map((row) => [row.userId, row.count])) };
}

const LEAK_MAX = 200 * 1024 * 1024;

/** A signed upload for the suspected leak; it goes to storage, not through the function. */
export async function startLeakCheck(params: { filename: string; mime: string; size: number }) {
  if (!["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"].includes(params.mime)) {
    throw new ServiceError("Upload a PNG, JPEG, WebP, AVIF or GIF image");
  }
  if (params.size <= 0 || params.size > LEAK_MAX) throw new ServiceError("Images up to 200 MB");
  const key = `leaks/${randomUUID()}/${safeFilename(params.filename)}`;
  return {
    key,
    url: await presignUpload({ key, contentType: params.mime, contentLength: params.size }),
  };
}

/** Reads the watermark of an uploaded leak and says whose download it was. */
export async function detectLeak(actorId: string, key: string) {
  if (!/^leaks\/[0-9a-f-]{36}\/[^/]+$/.test(key)) throw new ServiceError("Unknown upload");
  try {
    const image = await getObjectBuffer(key);
    const metadata = await sharp(image, { failOn: "none" }).metadata();
    if (!metadata.width || !metadata.height) throw new ServiceError("Not a readable image");
    const candidates = await candidateSizes(metadata.width, metadata.height);
    const watermark = await findWatermark(image, downloadEnv().WATERMARK_SECRET, candidates);
    if (watermark === null) {
      await audit(actorId, "leak-check", "download", null, { found: false });
      return { found: false as const };
    }

    const hit = await lookupWatermark(watermark);
    const db = getDb();
    const [user] = hit?.userId
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, hit.userId))
      : [];
    const [file] = hit?.assetId
      ? await db
          .select({ filename: assets.filename, workId: works.id, workTitle: works.title })
          .from(assets)
          .innerJoin(works, eq(assets.workId, works.id))
          .where(eq(assets.id, hit.assetId))
      : [];
    await audit(actorId, "leak-check", "download", hit?.downloadId ?? null, {
      found: true,
      watermark: watermark.toString(16),
    });
    return {
      found: true as const,
      watermark: watermark.toString(16),
      downloadedAt: hit?.createdAt.toISOString() ?? null,
      kind: hit?.kind ?? null,
      user: user ? { id: user.id, name: user.name } : null,
      file: file
        ? { filename: file.filename, workId: file.workId, workTitle: file.workTitle }
        : null,
    };
  } finally {
    await deleteObjects([key]);
  }
}
