import "server-only";
import sharp from "sharp";
import { embed, extract, type RawImage } from "./core";

export { randomWatermarkId } from "./core";

/** Formats that keep their format when watermarked; GIF and anything else is served as is. */
const formats = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export const canWatermark = (mime: string) => mime in formats;

const LIMIT = { limitInputPixels: 1_000_000_000, failOn: "none" } as const;

async function decode(input: Buffer) {
  // Orientation is baked into the pixels, so the copy looks the same without the EXIF tag.
  const { data, info } = await sharp(input, LIMIT)
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels } as RawImage;
}

/**
 * A copy of the image carrying `id` in its pixels (and, as a weak second
 * layer, in its EXIF description), in the original format at high quality.
 */
export async function watermarkImage(original: Buffer, mime: string, id: bigint, secret: string) {
  const format = formats[mime as keyof typeof formats];
  if (!format) throw new Error(`Cannot watermark ${mime}`);

  const image = await decode(original);
  const pixels = embed(image, id, secret);
  const output = sharp(Buffer.from(pixels), {
    raw: { width: image.width, height: image.height, channels: image.channels as 3 | 4 },
  })
    .keepIccProfile()
    .withExif({ IFD0: { ImageDescription: `moetsukita:${id.toString(16)}` } });

  const encoded =
    format === "png"
      ? output.png({ compressionLevel: 6 })
      : format === "jpeg"
        ? output.jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
        : format === "webp"
          ? output.webp({ quality: 95 })
          : output.avif({ quality: 90 });
  return encoded.toBuffer();
}

/**
 * The id in a suspected leak. Tries the image as it is, then scaled back to
 * each candidate size (originals with a similar aspect ratio), since scaling
 * moves the 8×8 grid the watermark lives on.
 */
export async function findWatermark(
  input: Buffer,
  secret: string,
  candidates: { width: number; height: number }[],
) {
  const image = await decode(input);
  const found = extract(image, secret);
  if (found !== null) return found;

  for (const size of candidates) {
    if (size.width === image.width && size.height === image.height) continue;
    const { data, info } = await sharp(Buffer.from(image.data), {
      raw: { width: image.width, height: image.height, channels: image.channels as 3 | 4 },
    })
      .resize(size.width, size.height, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const id = extract(
      { data, width: info.width, height: info.height, channels: info.channels },
      secret,
    );
    if (id !== null) return id;
  }
  return null;
}
