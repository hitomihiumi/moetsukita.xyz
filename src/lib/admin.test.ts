import { describe, expect, it } from "vitest";
import { assetKindOf, formatBytes } from "./files";
import { slugify } from "./slug";

describe("slugify", () => {
  it("makes URL-safe slugs and falls back for non-Latin titles", () => {
    expect(slugify("Summer Night — Variations!")).toBe("summer-night-variations");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugify("星空", "untitled-1")).toBe("untitled-1");
  });
});

describe("assetKindOf", () => {
  it("accepts images, sources and archives only", () => {
    expect(assetKindOf("a.png", "image/png")).toBe("image");
    expect(assetKindOf("a.PSD", "image/vnd.adobe.photoshop")).toBe("source");
    expect(assetKindOf("a.clip", "")).toBe("source");
    expect(assetKindOf("pack.zip", "application/zip")).toBe("archive");
    expect(assetKindOf("evil.exe", "application/octet-stream")).toBeNull();
    expect(assetKindOf("page.svg", "image/svg+xml")).toBeNull();
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
