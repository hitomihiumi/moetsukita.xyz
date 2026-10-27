import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { pgCode, UNIQUE_VIOLATION } from "./admin/errors";
import { hasRole } from "./auth/roles";
import type { Viewer } from "./auth/viewer";
import { getDb } from "./db";
import { assets, downloads, tiers, works } from "./db/schema";
import { downloadEnv } from "./env";
import { getObjectBuffer, presignDownload, putObject, storageKeys } from "./storage";
import { canWatermark, randomWatermarkId, watermarkImage } from "./watermark";

export type DownloadErrorCode = "unauthorized" | "not_found" | "forbidden" | "age" | "rate_limited";

export class DownloadError extends Error {
  constructor(readonly code: DownloadErrorCode) {
    super(code);
  }
}

/** A day-old copy may already be gone (lifecycle rule), so reuse stops a little earlier. */
const REUSE_WINDOW_MS = 20 * 60 * 60 * 1000;

export function hashIp(ip: string | null, secret: string) {
  return ip ? createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32) : null;
}

async function checkRate(userId: string) {
  const { DOWNLOADS_PER_HOUR, DOWNLOADS_PER_DAY } = downloadEnv();
  const since = (ms: number) => new Date(Date.now() - ms);
  const [[hour], [day]] = await Promise.all(
    [60 * 60 * 1000, 24 * 60 * 60 * 1000].map((window) =>
      getDb()
        .select({ count: count() })
        .from(downloads)
        .where(and(eq(downloads.userId, userId), gt(downloads.createdAt, since(window)))),
    ),
  );
  if (hour.count >= DOWNLOADS_PER_HOUR || day.count >= DOWNLOADS_PER_DAY) {
    throw new DownloadError("rate_limited");
  }
}

/**
 * Checks everything, logs the download and returns a link that works for a
 * minute and a half. Images get a copy watermarked with a per-download id.
 */
export async function issueDownload(
  viewer: Viewer | null,
  assetId: string,
  context: { adult: boolean; ip: string | null; userAgent: string | null },
) {
  if (!viewer) throw new DownloadError("unauthorized");
  const db = getDb();
  const staff = hasRole(viewer, "editor");

  const [row] = await db
    .select({ asset: assets, work: works })
    .from(assets)
    .innerJoin(works, eq(assets.workId, works.id))
    .where(and(eq(assets.id, assetId), eq(assets.status, "ready")));
  if (!row) throw new DownloadError("not_found");
  const { asset, work } = row;

  const visible =
    (work.status === "published" || work.status === "scheduled") &&
    work.publishedAt !== null &&
    work.publishedAt <= new Date();
  if (!visible && !staff) throw new DownloadError("not_found");
  if (work.rating === "nsfw" && !context.adult && !staff) throw new DownloadError("age");

  const tierIds = [work.minTierId, asset.minTierId].filter((id): id is string => id !== null);
  const required = tierIds.length
    ? await db.select({ rank: tiers.rank }).from(tiers).where(inArray(tiers.id, tierIds))
    : [];
  const needed = Math.max(0, ...required.map((tier) => tier.rank));
  if (needed > viewer.rank && !staff) throw new DownloadError("forbidden");

  if (!staff) await checkRate(viewer.id);

  const { WATERMARK_SECRET } = downloadEnv();
  const log = {
    userId: viewer.id,
    assetId: asset.id,
    ipHash: hashIp(context.ip, WATERMARK_SECRET),
    userAgent: context.userAgent?.slice(0, 300) ?? null,
  };
  const link = (key: string) => presignDownload({ key, filename: asset.filename });

  if (asset.kind !== "image" || !canWatermark(asset.mime)) {
    await db.insert(downloads).values(log);
    return { url: await link(asset.storageKey), watermarked: false };
  }

  // The same person downloading the same file again gets the copy made for them.
  const [recent] = await db
    .select({ derivedKey: downloads.derivedKey })
    .from(downloads)
    .where(
      and(
        eq(downloads.userId, viewer.id),
        eq(downloads.assetId, asset.id),
        isNotNull(downloads.derivedKey),
        gt(downloads.createdAt, new Date(Date.now() - REUSE_WINDOW_MS)),
      ),
    )
    .orderBy(desc(downloads.createdAt))
    .limit(1);
  if (recent?.derivedKey) {
    await db.insert(downloads).values({ ...log, derivedKey: recent.derivedKey });
    return { url: await link(recent.derivedKey), watermarked: true };
  }

  const original = await getObjectBuffer(asset.storageKey);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomUUID();
    const watermark = randomWatermarkId();
    const derivedKey = storageKeys.derived(id, asset.filename);
    try {
      // Claim the id first, so two downloads can never share it.
      await db.insert(downloads).values({ ...log, id, watermark, derivedKey });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) continue;
      throw error;
    }
    try {
      const copy = await watermarkImage(original, asset.mime, watermark, WATERMARK_SECRET);
      await putObject({ key: derivedKey, body: copy, contentType: asset.mime });
    } catch (error) {
      // No copy, no record: a later download must not be pointed at a missing file.
      await db.delete(downloads).where(eq(downloads.id, id));
      throw error;
    }
    return { url: await link(derivedKey), watermarked: true };
  }
  throw new Error("Could not allocate a watermark id");
}

/** Who received the copy carrying this watermark. */
export async function lookupWatermark(watermark: bigint) {
  const [row] = await getDb()
    .select({
      downloadId: downloads.id,
      createdAt: downloads.createdAt,
      userId: downloads.userId,
      assetId: downloads.assetId,
      ipHash: downloads.ipHash,
    })
    .from(downloads)
    .where(eq(downloads.watermark, watermark));
  return row ?? null;
}

/** Sizes of originals to try when a leak was rescaled: close aspect ratios first. */
export async function candidateSizes(width: number, height: number, limit = 8) {
  const ratio = width / height;
  return getDb()
    .select({ width: assets.width, height: assets.height })
    .from(assets)
    .where(
      and(
        eq(assets.kind, "image"),
        isNotNull(assets.width),
        isNotNull(assets.height),
        lte(sql`abs(${assets.width}::float / ${assets.height} - ${ratio})`, ratio * 0.02),
      ),
    )
    .orderBy(sql`abs(${assets.width}::float / ${assets.height} - ${ratio})`)
    .limit(limit) as Promise<{ width: number; height: number }[]>;
}
