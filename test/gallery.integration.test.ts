/** Gallery visibility, access and search against a real Postgres (TEST_DATABASE_URL). */
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { resetDatabase } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
Object.assign(process.env, { DATABASE_URL: url });

const { getDb } = await import("@/server/db");
const schema = await import("@/server/db/schema");
const { searchWorks, getPublicWork } = await import("@/server/gallery/works");
const { parseGalleryQuery } = await import("@/lib/search");

const adult = { rank: 0, adult: true };
const slugs = async (params: Record<string, string>, audience = adult) =>
  (await searchWorks(parseGalleryQuery(params), audience)).items.map((item) => item.slug).sort();

describe.skipIf(!url)("gallery", () => {
  beforeAll(async () => {
    await resetDatabase(url as string);
    const db = getDb();
    await db.execute(sql`truncate works, tiers, tags restart identity cascade`);
    const [supporter, ultimate] = await db
      .insert(schema.tiers)
      .values([
        { rank: 1, name: { en: "Supporter" } },
        { rank: 3, name: { en: "Ultimate" } },
      ])
      .returning();
    const hour = 3_600_000;
    const rows = await db
      .insert(schema.works)
      .values([
        {
          slug: "public-sky",
          title: { en: "Starry sky", ru: "Звёздное небо" },
          status: "published",
          publishedAt: new Date(Date.now() - hour),
        },
        {
          slug: "nsfw-locked",
          title: { en: "Summer", ja: "夏の差分" },
          rating: "nsfw",
          minTierId: supporter.id,
          status: "published",
          publishedAt: new Date(Date.now() - 2 * hour),
        },
        {
          slug: "top-tier",
          title: { en: "Commission" },
          minTierId: ultimate.id,
          status: "published",
          publishedAt: new Date(Date.now() - 3 * hour),
        },
        { slug: "draft", title: { en: "Draft sky" }, status: "draft" },
        {
          slug: "future",
          title: { en: "Future sky" },
          status: "scheduled",
          publishedAt: new Date(Date.now() + hour),
        },
      ])
      .returning();
    const bySlug = Object.fromEntries(rows.map((row) => [row.slug, row.id]));
    const [miku, wip] = await db
      .insert(schema.tags)
      .values([
        { slug: "hatsune-miku", name: { en: "Hatsune Miku", ja: "初音ミク" }, aliases: ["miku"] },
        { slug: "wip", name: { en: "WIP" } },
      ])
      .returning();
    await db.insert(schema.workTags).values([
      { workId: bySlug["nsfw-locked"], tagId: miku.id },
      { workId: bySlug["top-tier"], tagId: miku.id },
      { workId: bySlug["top-tier"], tagId: wip.id },
    ]);
    await db.insert(schema.assets).values([
      {
        workId: bySlug["top-tier"],
        kind: "image",
        status: "ready",
        storageKey: "a",
        filename: "a.png",
        mime: "image/png",
        size: 1,
      },
      {
        workId: bySlug["top-tier"],
        kind: "source",
        status: "ready",
        storageKey: "b",
        filename: "b.psd",
        mime: "",
        size: 1,
        minTierId: ultimate.id,
      },
      {
        workId: bySlug["public-sky"],
        kind: "source",
        status: "ready",
        storageKey: "c",
        filename: "c.psd",
        mime: "",
        size: 1,
        minTierId: supporter.id,
      },
      {
        workId: bySlug["public-sky"],
        kind: "image",
        status: "pending",
        storageKey: "d",
        filename: "d.png",
        mime: "image/png",
        size: 1,
      },
    ]);
  });

  it("shows published and due works only", async () => {
    expect(await slugs({})).toEqual(["nsfw-locked", "public-sky", "top-tier"]);
  });

  it("hides NSFW entirely until 18+ is confirmed", async () => {
    expect(await slugs({}, { rank: 5, adult: false })).toEqual(["public-sky", "top-tier"]);
    // Asking for NSFW without the confirmation still yields SFW only.
    expect(await slugs({ rating: "nsfw" }, { rank: 5, adult: false })).toEqual([
      "public-sky",
      "top-tier",
    ]);
    expect(await getPublicWork("nsfw-locked", { rank: 5, adult: false })).toEqual({
      ageGate: true,
    });
  });

  it("finds text in any language, and through tag names and aliases", async () => {
    expect(await slugs({ q: "небо" })).toEqual(["public-sky"]);
    expect(await slugs({ q: "差分" })).toEqual(["nsfw-locked"]);
    expect(await slugs({ q: "初音" })).toEqual(["nsfw-locked", "top-tier"]);
    expect(await slugs({ q: "100%" })).toEqual([]);
  });

  it("filters by tags, aliases and exclusions", async () => {
    expect(await slugs({ tags: "miku" })).toEqual(["nsfw-locked", "top-tier"]);
    expect(await slugs({ tags: "hatsune-miku", exclude: "wip" })).toEqual(["nsfw-locked"]);
    expect(await slugs({ q: "-tag:wip" })).toEqual(["nsfw-locked", "public-sky"]);
  });

  it("marks locked works and filters to what the visitor can open", async () => {
    const { items } = await searchWorks(parseGalleryQuery({}), { rank: 1, adult: true });
    expect(Object.fromEntries(items.map((item) => [item.slug, item.locked]))).toEqual({
      "public-sky": false,
      "nsfw-locked": false,
      "top-tier": true,
    });
    expect(await slugs({ mine: "1" }, { rank: 1, adult: true })).toEqual([
      "nsfw-locked",
      "public-sky",
    ]);
  });

  it("locks files that ask for more than their work, and drops unfinished uploads", async () => {
    const work = await getPublicWork("public-sky", { rank: 0, adult: true });
    if (!work || work.ageGate) throw new Error("expected the work");
    expect(work.locked).toBe(false);
    expect(work.files.map((file) => [file.filename, file.locked])).toEqual([["c.psd", true]]);

    const top = await getPublicWork("top-tier", { rank: 3, adult: true });
    if (!top || top.ageGate) throw new Error("expected the work");
    expect(top.files.every((file) => !file.locked)).toBe(true);
    expect(await getPublicWork("draft", adult)).toBeNull();
    expect(await getPublicWork("future", adult)).toBeNull();
  });
});
