import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, max } from "drizzle-orm";
import sharp from "sharp";
import { assetKindOf } from "@/lib/files";
import { getDb } from "../db";
import { assets, works } from "../db/schema";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObjects,
  getObjectBuffer,
  headObject,
  multipartPartSize,
  presignUpload,
  presignUploadPart,
  putObject,
  storageKeys,
} from "../storage";
import { audit } from "./audit";
import { ServiceError } from "./errors";

/** Above this, the browser uploads in parts. */
export const SINGLE_UPLOAD_MAX = 100 * 1024 * 1024;
export const UPLOAD_MAX = 20 * 1024 * 1024 * 1024;

export type UploadPlan =
  | { assetId: string; mode: "single"; url: string; contentType: string }
  | { assetId: string; mode: "multipart"; uploadId: string; partSize: number; urls: string[] };

export async function startUpload(
  actorId: string,
  params: { workId: string; filename: string; mime: string; size: number },
): Promise<UploadPlan> {
  const kind = assetKindOf(params.filename, params.mime);
  if (!kind) throw new ServiceError(`${params.filename}: unsupported file type`);
  if (!Number.isInteger(params.size) || params.size <= 0 || params.size > UPLOAD_MAX) {
    throw new ServiceError(`${params.filename}: size must be between 1 byte and 20 GB`);
  }

  const db = getDb();
  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.id, params.workId));
  if (!work) throw new ServiceError("Work not found");
  const [{ last }] = await db
    .select({ last: max(assets.position) })
    .from(assets)
    .where(eq(assets.workId, params.workId));

  const assetId = randomUUID();
  const key = storageKeys.original(params.workId, assetId, params.filename);
  // Only images keep their type; anything else is stored as opaque bytes so no
  // client-chosen type (text/html, say) is ever served back from storage.
  const mime = kind === "image" ? params.mime : "application/octet-stream";
  await db.insert(assets).values({
    id: assetId,
    workId: params.workId,
    kind,
    storageKey: key,
    filename: params.filename,
    mime,
    size: params.size,
    position: (last ?? -1) + 1,
  });
  await audit(actorId, "upload", "asset", assetId, {
    workId: params.workId,
    filename: params.filename,
  });

  if (params.size <= SINGLE_UPLOAD_MAX) {
    return {
      assetId,
      mode: "single",
      contentType: mime,
      url: await presignUpload({ key, contentType: mime, contentLength: params.size }),
    };
  }
  const uploadId = await createMultipartUpload({ key, contentType: mime });
  const partCount = Math.ceil(params.size / multipartPartSize);
  const urls = await Promise.all(
    Array.from({ length: partCount }, (_, index) =>
      presignUploadPart({ key, uploadId, partNumber: index + 1 }),
    ),
  );
  return { assetId, mode: "multipart", uploadId, partSize: multipartPartSize, urls };
}

async function getAsset(assetId: string) {
  const [asset] = await getDb().select().from(assets).where(eq(assets.id, assetId));
  if (!asset) throw new ServiceError("File not found");
  return asset;
}

/** Previews for the gallery: grid thumbnail, viewer size, and a blur for locked works. */
export async function renderPreviews(original: Buffer) {
  const image = () => sharp(original, { limitInputPixels: 1_000_000_000, failOn: "none" }).rotate();
  const [metadata, thumb, preview, blur] = await Promise.all([
    image().metadata(),
    image().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    image()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer(),
    // Small enough that nothing survives, even scaled up.
    image().resize({ width: 24 }).blur(1).webp({ quality: 50 }).toBuffer(),
  ]);
  const rotated = (metadata.orientation ?? 1) >= 5;
  return {
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
    thumb,
    preview,
    blur,
  };
}

async function processImage(assetId: string, storageKey: string) {
  const original = await getObjectBuffer(storageKey);
  const previews = await renderPreviews(original);
  const keys = {
    thumbKey: storageKeys.thumb(assetId),
    previewKey: storageKeys.preview(assetId),
    blurKey: storageKeys.blur(assetId),
  };
  const cache = "public, max-age=31536000, immutable";
  await Promise.all([
    putObject({
      key: keys.thumbKey,
      body: previews.thumb,
      contentType: "image/webp",
      cacheControl: cache,
    }),
    putObject({
      key: keys.previewKey,
      body: previews.preview,
      contentType: "image/webp",
      cacheControl: cache,
    }),
    putObject({
      key: keys.blurKey,
      body: previews.blur,
      contentType: "image/webp",
      cacheControl: cache,
      scope: "public",
    }),
  ]);
  return {
    ...keys,
    width: previews.width ?? null,
    height: previews.height ?? null,
    sha256: createHash("sha256").update(original).digest("hex"),
  };
}

/** Called once the browser finished uploading: verifies the object and builds previews. */
export async function completeUpload(
  actorId: string,
  params: { assetId: string; uploadId?: string; parts?: { partNumber: number; etag: string }[] },
) {
  const asset = await getAsset(params.assetId);
  const db = getDb();
  if (params.uploadId) {
    await completeMultipartUpload({
      key: asset.storageKey,
      uploadId: params.uploadId,
      parts: params.parts ?? [],
    });
  }
  const stored = await headObject(asset.storageKey);
  if (!stored || stored.size !== asset.size) {
    await db.update(assets).set({ status: "failed" }).where(eq(assets.id, asset.id));
    throw new ServiceError(`${asset.filename}: upload incomplete`);
  }

  if (asset.kind !== "image") {
    await db.update(assets).set({ status: "ready" }).where(eq(assets.id, asset.id));
    return;
  }
  await db.update(assets).set({ status: "processing" }).where(eq(assets.id, asset.id));
  try {
    const result = await processImage(asset.id, asset.storageKey);
    await db
      .update(assets)
      .set({ ...result, status: "ready" })
      .where(eq(assets.id, asset.id));
    // The first image becomes the cover.
    await db
      .update(works)
      .set({ coverAssetId: asset.id })
      .where(and(eq(works.id, asset.workId), isNull(works.coverAssetId)));
  } catch (error) {
    await db.update(assets).set({ status: "failed" }).where(eq(assets.id, asset.id));
    console.error("[assets] preview generation failed", error);
    throw new ServiceError(`${asset.filename}: could not read the image`);
  }
  await audit(actorId, "process", "asset", asset.id);
}

export async function abortUpload(actorId: string, params: { assetId: string; uploadId?: string }) {
  const asset = await getAsset(params.assetId);
  if (params.uploadId) {
    await abortMultipartUpload({ key: asset.storageKey, uploadId: params.uploadId }).catch(
      () => {},
    );
  }
  await deleteAsset(actorId, asset.id);
}

export async function deleteAsset(actorId: string, assetId: string) {
  const asset = await getAsset(assetId);
  await getDb().delete(assets).where(eq(assets.id, assetId));
  await deleteObjects(
    [asset.storageKey, asset.thumbKey, asset.previewKey].filter((key): key is string => !!key),
  );
  if (asset.blurKey) await deleteObjects([asset.blurKey], "public");
  await audit(actorId, "delete", "asset", assetId, { filename: asset.filename });
}

export async function reorderAssets(actorId: string, workId: string, orderedIds: string[]) {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx
        .update(assets)
        .set({ position })
        .where(and(eq(assets.id, id), eq(assets.workId, workId)));
    }
  });
  await audit(actorId, "reorder", "work", workId);
}

export async function setCover(actorId: string, workId: string, assetId: string) {
  const asset = await getAsset(assetId);
  if (asset.workId !== workId || asset.kind !== "image") {
    throw new ServiceError("Only an image of this work can be the cover");
  }
  await getDb().update(works).set({ coverAssetId: assetId }).where(eq(works.id, workId));
  await audit(actorId, "cover", "work", workId, { assetId });
}

export async function setAssetTier(actorId: string, assetId: string, tierId: string | null) {
  await getAsset(assetId);
  await getDb().update(assets).set({ minTierId: tierId }).where(eq(assets.id, assetId));
  await audit(actorId, "tier", "asset", assetId, { tierId });
}
