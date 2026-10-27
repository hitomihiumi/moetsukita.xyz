export type AssetKind = "image" | "archive" | "source";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);
const archiveExtensions = new Set(["zip", "7z", "rar", "tar", "gz"]);
const sourceExtensions = new Set([
  "psd",
  "psb",
  "clip",
  "kra",
  "sai",
  "sai2",
  "procreate",
  "xcf",
  "ora",
]);

/** What kind of asset a file becomes, or null when it is not accepted. */
export function assetKindOf(filename: string, mime: string): AssetKind | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (imageTypes.has(mime)) return "image";
  if (sourceExtensions.has(extension)) return "source";
  if (archiveExtensions.has(extension)) return "archive";
  return null;
}

export const acceptedExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ...[...sourceExtensions, ...archiveExtensions].map((extension) => `.${extension}`),
].join(",");

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
