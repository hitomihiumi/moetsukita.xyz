import sharp, { type Sharp } from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { embed, extract, type RawImage, randomWatermarkId } from "./core";

const secret = "test-secret";

async function decode(input: Buffer | Sharp) {
  const { data, info } = await (Buffer.isBuffer(input) ? sharp(input) : input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels } as RawImage;
}

const load = (image: RawImage) =>
  sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: image.channels as 3 | 4 },
  });

let original: RawImage;
let image: RawImage;
let id: bigint;

// Real art from the site, at the size of a typical original.
beforeAll(async () => {
  original = await decode(sharp("public/images/HLL2nkSXsAEAQsC.jpg").resize({ width: 3000 }));
  id = randomWatermarkId();
  image = { ...original, data: embed(original, id, secret) };
}, 60_000);

describe("watermark", () => {
  it("round-trips losslessly and stays invisible", () => {
    expect(extract(image, secret)).toBe(id);
    let squared = 0;
    for (let i = 0; i < original.data.length; i++)
      squared += (image.data[i] - original.data[i]) ** 2;
    const psnr = 10 * Math.log10(255 ** 2 / (squared / original.data.length));
    expect(psnr).toBeGreaterThan(45);
  });

  it("survives JPEG and WebP recompression", async () => {
    expect(extract(await decode(await load(image).jpeg({ quality: 70 }).toBuffer()), secret)).toBe(
      id,
    );
    expect(extract(await decode(await load(image).webp({ quality: 85 }).toBuffer()), secret)).toBe(
      id,
    );
  });

  it("survives a crop", async () => {
    const cropped = load(image)
      .extract({ left: 37, top: 101, width: 2200, height: 1000 })
      .jpeg({ quality: 85 });
    expect(extract(await decode(await cropped.toBuffer()), secret)).toBe(id);
  });

  it("survives a 50% downscale once resized back to the original size", async () => {
    const small = await load(image).resize(1500).jpeg({ quality: 80 }).toBuffer();
    const restored = sharp(small).resize(original.width, original.height, { fit: "fill" });
    expect(extract(await decode(await restored.png().toBuffer()), secret)).toBe(id);
  });

  // A miss scans every offset and phase: seconds on a 3000 px image.
  it("finds nothing in an unmarked image or with another secret", () => {
    expect(extract(original, secret)).toBeNull();
    expect(extract(image, "other-secret")).toBeNull();
  }, 60_000);

  it("leaves flat colour and alpha untouched", async () => {
    const flat = await sharp({
      create: { width: 256, height: 256, channels: 4, background: "#f6e6d880" },
    })
      .raw()
      .toBuffer();
    const rgba = { data: flat, width: 256, height: 256, channels: 4 };
    expect(Buffer.from(embed(rgba, 42n, secret)).equals(flat)).toBe(true);
  });

  it("rejects ids that do not fit", () => {
    expect(() => embed(original, 1n << 48n, secret)).toThrow();
  });
});
