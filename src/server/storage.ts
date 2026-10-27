import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageEnv } from "./env";

/**
 * Object layout. Everything lives in the private bucket and is handed out as
 * short-lived signed URLs, except `blur`, which goes to the public bucket.
 */
export const storageKeys = {
  original: (workId: string, assetId: string, filename: string) =>
    `originals/${workId}/${assetId}/${safeFilename(filename)}`,
  thumb: (assetId: string) => `previews/${assetId}/thumb.webp`,
  preview: (assetId: string) => `previews/${assetId}/view.webp`,
  /** In the public bucket. */
  blur: (assetId: string) => `blur/${assetId}.webp`,
  /** A watermarked copy for one download; a lifecycle rule removes it after a day. */
  derived: (downloadId: string, filename: string) =>
    `derived/${downloadId}/${safeFilename(filename)}`,
};

/** Signed URLs are short on purpose: a leaked link dies before it spreads. */
export const urlTtl = {
  upload: 15 * 60,
  view: 10 * 60,
  download: 90,
} as const;

/** S3 requires every part but the last to be at least 5 MiB; 64 MiB keeps part counts low. */
export const multipartPartSize = 64 * 1024 * 1024;

let client: S3Client | undefined;
let signer: S3Client | undefined;

function createClient(endpoint: string) {
  const env = storageEnv();
  return new S3Client({
    region: env.S3_REGION,
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    // Newer SDKs add CRC32 checksums to presigned uploads, which browsers
    // cannot compute and some S3 servers reject; only send them when required.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** For requests the server makes itself. */
function s3() {
  client ??= createClient(storageEnv().S3_ENDPOINT);
  return client;
}

/**
 * For signing URLs that browsers open. A signature covers the host, so these
 * must be signed for the public address, not the internal one.
 */
function s3Signer() {
  const env = storageEnv();
  signer ??= env.S3_PUBLIC_ENDPOINT ? createClient(env.S3_PUBLIC_ENDPOINT) : s3();
  return signer;
}

/** Which bucket an operation targets; private unless stated otherwise. */
export type BucketScope = "private" | "public";

const bucket = (scope: BucketScope = "private") =>
  scope === "public" ? storageEnv().S3_PUBLIC_BUCKET : storageEnv().S3_BUCKET;

/** Keeps a readable name for the key and Content-Disposition, without path tricks. */
export function safeFilename(filename: string) {
  const cleaned = filename
    .normalize("NFKC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return cleaned || "file";
}

/** `attachment` header that keeps non-ASCII (Japanese, Cyrillic) names intact. */
function contentDisposition(filename: string, disposition: "attachment" | "inline") {
  const name = safeFilename(filename);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// ─── Uploads (browser → bucket directly, bypassing the function body limit) ──

export async function presignUpload(params: {
  key: string;
  contentType: string;
  contentLength: number;
}) {
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: params.key,
    ContentType: params.contentType,
    // Signed, so the browser cannot upload a different size than it declared.
    ContentLength: params.contentLength,
  });
  return getSignedUrl(s3Signer(), command, { expiresIn: urlTtl.upload });
}

export async function createMultipartUpload(params: { key: string; contentType: string }) {
  const result = await s3().send(
    new CreateMultipartUploadCommand({
      Bucket: bucket(),
      Key: params.key,
      ContentType: params.contentType,
    }),
  );
  if (!result.UploadId) throw new Error("Storage did not return an upload id.");
  return result.UploadId;
}

export async function presignUploadPart(params: {
  key: string;
  uploadId: string;
  partNumber: number;
}) {
  const command = new UploadPartCommand({
    Bucket: bucket(),
    Key: params.key,
    UploadId: params.uploadId,
    PartNumber: params.partNumber,
  });
  return getSignedUrl(s3Signer(), command, { expiresIn: urlTtl.upload });
}

export async function completeMultipartUpload(params: {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: params.key,
      UploadId: params.uploadId,
      MultipartUpload: {
        Parts: [...params.parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload(params: { key: string; uploadId: string }) {
  await s3().send(
    new AbortMultipartUploadCommand({
      Bucket: bucket(),
      Key: params.key,
      UploadId: params.uploadId,
    }),
  );
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** A signed GET; `attachment` makes the browser save it under `filename`. */
export async function presignDownload(params: {
  key: string;
  filename?: string;
  disposition?: "attachment" | "inline";
  expiresIn?: number;
}) {
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: params.key,
    ResponseContentDisposition: params.filename
      ? contentDisposition(params.filename, params.disposition ?? "attachment")
      : undefined,
  });
  return getSignedUrl(s3Signer(), command, { expiresIn: params.expiresIn ?? urlTtl.download });
}

/** URL of an object in the public bucket, served by its domain without a signature. */
export function publicUrl(key: string) {
  const env = storageEnv();
  const base =
    env.S3_PUBLIC_BASE_URL ??
    `${(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT).replace(/\/$/, "")}/${env.S3_PUBLIC_BUCKET}`;
  return `${base.replace(/\/$/, "")}/${key}`;
}

export async function headObject(key: string, scope?: BucketScope) {
  try {
    const result = await s3().send(new HeadObjectCommand({ Bucket: bucket(scope), Key: key }));
    return { size: result.ContentLength ?? 0, contentType: result.ContentType, etag: result.ETag };
  } catch (error) {
    if ((error as { name?: string }).name === "NotFound") return null;
    throw error;
  }
}

export async function getObjectBuffer(key: string) {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error(`Empty object: ${key}`);
  return Buffer.from(await result.Body.transformToByteArray());
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  cacheControl?: string;
  scope?: BucketScope;
}) {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(params.scope),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
    }),
  );
}

export async function deleteObjects(keys: string[], scope?: BucketScope) {
  // DeleteObjects takes at most 1000 keys per request.
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    if (batch.length === 0) continue;
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket(scope),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/** For scripts that manage the buckets themselves (CORS, lifecycle). */
export function storageClient() {
  return { client: s3(), bucket: bucket("private"), publicBucket: bucket("public") };
}

const PREVIEW_WINDOW_MS = 5 * 60 * 1000;

/**
 * A short-lived URL to show a private preview in the browser; null when there
 * is none. Signed at the start of a 5-minute window, so the URL stays the same
 * across requests in that window and the browser cache can hold the image.
 */
export async function previewUrl(key: string | null) {
  if (!key) return null;
  const signingDate = new Date(Math.floor(Date.now() / PREVIEW_WINDOW_MS) * PREVIEW_WINDOW_MS);
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(s3Signer(), command, { expiresIn: urlTtl.view, signingDate });
}
