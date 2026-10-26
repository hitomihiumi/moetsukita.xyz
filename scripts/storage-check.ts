/**
 * End-to-end check of the storage credentials and bucket setup: signed upload,
 * signed download with a non-ASCII filename, link expiry, multipart upload and
 * the public bucket. Leaves nothing behind.
 *
 *   npm run storage:check
 */
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`✗ ${message}`);
  console.log(`✓ ${message}`);
}

async function main() {
  const storage = await import("../src/server/storage");
  const id = randomUUID();
  const key = `checks/${id}/file.bin`;
  const publicKey = `checks/${id}.txt`;
  const multipartKey = `checks/${id}/multipart.bin`;
  const body = new TextEncoder().encode(`storage check ${id}`);

  try {
    const uploadUrl = await storage.presignUpload({
      key,
      contentType: "application/octet-stream",
      contentLength: body.byteLength,
    });
    const put = await fetch(uploadUrl, {
      method: "PUT",
      body,
      headers: { "content-type": "application/octet-stream" },
    });
    assert(put.ok, `signed upload (${put.status})`);

    const head = await storage.headObject(key);
    assert(head?.size === body.byteLength, "object size matches");

    const downloadUrl = await storage.presignDownload({ key, filename: "星空 — final.png" });
    const get = await fetch(downloadUrl);
    assert(get.ok && (await get.text()) === new TextDecoder().decode(body), "signed download");
    const disposition = get.headers.get("content-disposition") ?? "";
    assert(
      disposition.includes("attachment") && disposition.includes("filename*=UTF-8''"),
      `content-disposition: ${disposition}`,
    );

    const unsigned = await fetch(downloadUrl.split("?")[0]);
    assert(!unsigned.ok, `private object refuses unsigned GET (${unsigned.status})`);

    const shortUrl = await storage.presignDownload({ key, expiresIn: 1 });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const expired = await fetch(shortUrl);
    assert(!expired.ok, `expired link refused (${expired.status})`);

    const partSize = 5 * 1024 * 1024;
    const uploadId = await storage.createMultipartUpload({
      key: multipartKey,
      contentType: "application/octet-stream",
    });
    const parts = [];
    for (const [index, size] of [partSize, 1024].entries()) {
      const url = await storage.presignUploadPart({
        key: multipartKey,
        uploadId,
        partNumber: index + 1,
      });
      const response = await fetch(url, { method: "PUT", body: new Uint8Array(size) });
      const etag = response.headers.get("etag");
      assert(response.ok && etag, `multipart part ${index + 1}`);
      parts.push({ partNumber: index + 1, etag });
    }
    await storage.completeMultipartUpload({ key: multipartKey, uploadId, parts });
    const multipart = await storage.headObject(multipartKey);
    assert(multipart?.size === partSize + 1024, "multipart upload completed");

    await storage.putObject({
      key: publicKey,
      body: "public",
      contentType: "text/plain",
      scope: "public",
    });
    const anonymous = await fetch(storage.publicUrl(publicKey));
    assert(anonymous.ok, `public bucket readable without signature (${anonymous.status})`);
  } finally {
    await storage.deleteObjects([key, multipartKey]);
    await storage.deleteObjects([publicKey], "public");
    console.log("✓ cleaned up");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
