import { abortUploadAction, completeUploadAction, startUploadAction } from "@/app/admin/actions";

/** PUT with upload progress (fetch has none); resolves with the ETag. */
function put(
  url: string,
  body: Blob,
  contentType: string | null,
  onProgress: (loaded: number) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag") ?? "")
        : reject(new Error(`Storage answered ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

const PARALLEL_PARTS = 3;

/**
 * Uploads a file straight to storage with signed URLs (in parts when large),
 * then lets the server verify it and build previews.
 */
export async function uploadFile(
  workId: string,
  file: File,
  onProgress: (fraction: number) => void,
) {
  const mime = file.type || "application/octet-stream";
  const started = await startUploadAction({
    workId,
    filename: file.name,
    mime,
    size: file.size,
  });
  if (!started.ok) throw new Error(started.error);
  const plan = started.data;

  try {
    if (plan.mode === "single") {
      await put(plan.url, file, plan.contentType, (loaded) => onProgress(loaded / file.size));
      const done = await completeUploadAction({ assetId: plan.assetId });
      if (!done.ok) throw new Error(done.error);
      return;
    }

    const loaded = new Array<number>(plan.urls.length).fill(0);
    const parts: { partNumber: number; etag: string }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < plan.urls.length) {
        const index = next++;
        const blob = file.slice(index * plan.partSize, (index + 1) * plan.partSize);
        const etag = await put(plan.urls[index], blob, null, (bytes) => {
          loaded[index] = bytes;
          onProgress(loaded.reduce((sum, value) => sum + value, 0) / file.size);
        });
        if (!etag) throw new Error("Storage did not expose the ETag header (check CORS)");
        parts.push({ partNumber: index + 1, etag });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_PARTS }, worker));
    const done = await completeUploadAction({
      assetId: plan.assetId,
      uploadId: plan.uploadId,
      parts,
    });
    if (!done.ok) throw new Error(done.error);
  } catch (error) {
    await abortUploadAction({
      assetId: plan.assetId,
      uploadId: plan.mode === "multipart" ? plan.uploadId : undefined,
    });
    throw error;
  }
}
