import { describe, expect, it } from "vitest";
import { highestTier } from "@/server/access/tiers";
import { pickLocalized } from "./localized";
import { safeCallbackPath } from "./paths";

describe("safeCallbackPath", () => {
  it.each(["/account", "/ru/account?tab=1", "/"])("keeps the same-site path %s", (path) => {
    expect(safeCallbackPath(path, "/fallback")).toBe(path);
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "account", undefined, 42])(
    "falls back for %s",
    (value) => {
      expect(safeCallbackPath(value, "/fallback")).toBe("/fallback");
    },
  );
});

describe("pickLocalized", () => {
  it("prefers the locale, then English, then anything", () => {
    expect(pickLocalized({ en: "Hi", ru: "Привет" }, "ru")).toBe("Привет");
    expect(pickLocalized({ en: "Hi", ru: "Привет" }, "ja")).toBe("Hi");
    expect(pickLocalized({ ja: "こんにちは" }, "ru")).toBe("こんにちは");
    expect(pickLocalized(null, "en")).toBe("");
  });
});

describe("highestTier", () => {
  it("picks the highest rank", () => {
    expect(highestTier([{ rank: 1 }, { rank: 3 }, { rank: 2 }])).toEqual({ rank: 3 });
    expect(highestTier([])).toBeNull();
  });
});
