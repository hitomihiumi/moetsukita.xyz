import { describe, expect, it } from "vitest";
import { escapeLike, galleryQueryString, parseGalleryQuery } from "./search";

describe("parseGalleryQuery", () => {
  it("reads search box operators next to the dedicated parameters", () => {
    expect(
      parseGalleryQuery({ q: "night tag:Miku -tag:wip rating:nsfw sky", tags: "original" }),
    ).toEqual({
      text: "night sky",
      tags: ["original", "miku"],
      exclude: ["wip"],
      rating: "nsfw",
      mine: false,
      sort: "new",
      page: 1,
    });
  });

  it("falls back to defaults for junk", () => {
    expect(parseGalleryQuery({ rating: "evil", page: "-3", sort: "random" })).toMatchObject({
      rating: "all",
      page: 1,
      sort: "new",
    });
  });

  it("round-trips through the query string", () => {
    const query = parseGalleryQuery({ q: "sky", tags: "a,b", mine: "1", sort: "old", page: "2" });
    expect(
      parseGalleryQuery(Object.fromEntries(new URLSearchParams(galleryQueryString(query)))),
    ).toEqual(query);
    expect(galleryQueryString(parseGalleryQuery({}))).toBe("");
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
  });
});
