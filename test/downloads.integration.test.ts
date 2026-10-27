/** Downloads and leak detection against a real Postgres (TEST_DATABASE_URL); storage is in memory. */
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
const SECRET = "test-watermark-secret-0123456789";
Object.assign(process.env, {
  DATABASE_URL: url,
  WATERMARK_SECRET: SECRET,
  DOWNLOADS_PER_HOUR: "4",
  DOWNLOADS_PER_DAY: "100",
});

const objects = new Map<string, Buffer>();
vi.mock("@/server/storage", () => ({
  getObjectBuffer: vi.fn(async (key: string) => {
    const body = objects.get(key);
    if (!body) throw new Error(`missing ${key}`);
    return body;
  }),
  putObject: vi.fn(async ({ key, body }: { key: string; body: Buffer }) => {
    objects.set(key, body);
  }),
  deleteObjects: vi.fn(async (keys: string[]) => {
    for (const key of keys) objects.delete(key);
  }),
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://files.test/${key}?signed`),
  previewUrl: vi.fn(async (key: string) => `https://files.test/${key}?view`),
  presignUpload: vi.fn(async () => "https://files.test/upload"),
  safeFilename: (name: string) => name,
  storageKeys: { derived: (id: string, name: string) => `derived/${id}/${name}` },
}));

const { getDb } = await import("@/server/db");
const schema = await import("@/server/db/schema");
const { issueDownload, issuePreview, DownloadError } = await import("@/server/downloads");
const { detectLeak } = await import("@/server/admin/downloads");

type Viewer = Parameters<typeof issueDownload>[0] & object;
const context = { adult: true, ip: "203.0.113.7", userAgent: "vitest" };
const ids: Record<string, string> = {};
let fan: Viewer;

const viewer = (id: string, rank: number, role: "user" | "admin" = "user") =>
  ({
    id,
    rank,
    role,
    name: "x",
    image: null,
    ageConfirmed: true,
    tier: null,
    sources: [],
    accessSyncedAt: null,
    providers: [],
  }) as Viewer;

const expectError = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(DownloadError);
  await expect(promise).rejects.toMatchObject({ code });
};

describe.skipIf(!url)("downloads", () => {
  beforeAll(async () => {
    await resetDatabase(url as string);
    const db = getDb();
    const [t1, t3] = await db
      .insert(schema.tiers)
      .values([
        { rank: 1, name: { en: "Supporter" } },
        { rank: 3, name: { en: "Ultimate" } },
      ])
      .returning();
    const [work, nsfw] = await db
      .insert(schema.works)
      .values([
        {
          slug: "w",
          title: { en: "W" },
          minTierId: t1.id,
          status: "published",
          publishedAt: new Date(0),
        },
        {
          slug: "n",
          title: { en: "N" },
          rating: "nsfw",
          status: "published",
          publishedAt: new Date(0),
        },
      ])
      .returning();
    const art = await sharp("public/images/HLL2nkSXsAEAQsC.jpg")
      .resize({ width: 2400 })
      .png()
      .toBuffer();
    objects.set("originals/art.png", art);
    objects.set(
      "previews/art/view.webp",
      await sharp(art).resize(2048).webp({ quality: 85 }).toBuffer(),
    );
    objects.set("originals/src.psd", Buffer.from("psd"));
    objects.set("originals/n.psd", Buffer.from("psd"));
    const rows = await db
      .insert(schema.assets)
      .values([
        {
          workId: work.id,
          kind: "image",
          status: "ready",
          storageKey: "originals/art.png",
          filename: "art.png",
          mime: "image/png",
          size: art.length,
          width: 2400,
          height: 1034,
          previewKey: "previews/art/view.webp",
        },
        {
          workId: work.id,
          kind: "source",
          status: "ready",
          storageKey: "originals/src.psd",
          filename: "src.psd",
          mime: "",
          size: 3,
          minTierId: t3.id,
        },
        {
          workId: nsfw.id,
          kind: "source",
          status: "ready",
          storageKey: "originals/n.psd",
          filename: "n.psd",
          mime: "",
          size: 3,
        },
      ])
      .returning();
    [ids.image, ids.source, ids.nsfw] = rows.map((row) => row.id);
    const [user] = await db.insert(schema.users).values({ name: "Fan" }).returning();
    fan = viewer(user.id, 1);
  }, 60_000);

  beforeEach(async () => {
    await getDb().execute(sql`truncate downloads`);
  });

  it("refuses guests, missing tiers, stricter file tiers and unconfirmed NSFW", async () => {
    await expectError(issueDownload(null, ids.image, context), "unauthorized");
    await expectError(issueDownload(viewer(fan.id, 0), ids.image, context), "forbidden");
    await expectError(issueDownload(fan, ids.source, context), "forbidden");
    await expectError(issueDownload(fan, ids.nsfw, { ...context, adult: false }), "age");
  });

  it("watermarks an image for the downloader and the leak check finds them", async () => {
    const result = await issueDownload(fan, ids.image, context);
    expect(result.watermarked).toBe(true);
    const [row] = await getDb().select().from(schema.downloads);
    expect(row.userId).toBe(fan.id);
    expect(row.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.ipHash).not.toContain("203.0.113.7");
    const copy = objects.get(row.derivedKey as string) as Buffer;
    expect(result.url).toContain(row.derivedKey as string);

    // The copy shows up somewhere as a recompressed JPEG.
    const leak = await sharp(copy).jpeg({ quality: 80 }).toBuffer();
    objects.set("leaks/00000000-0000-4000-8000-000000000000/leak.jpg", leak);
    const found = await detectLeak(fan.id, "leaks/00000000-0000-4000-8000-000000000000/leak.jpg");
    expect(found).toMatchObject({
      found: true,
      user: { id: fan.id },
      file: { filename: "art.png" },
    });
    expect(objects.has("leaks/00000000-0000-4000-8000-000000000000/leak.jpg")).toBe(false);
  }, 120_000);

  it("reuses the person's copy on a repeat download and logs both", async () => {
    await issueDownload(fan, ids.image, context);
    await issueDownload(fan, ids.image, context);
    const rows = await getDb().select().from(schema.downloads);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.derivedKey)).size).toBe(1);
    expect(rows.filter((row) => row.watermark !== null)).toHaveLength(1);
  }, 60_000);

  it("serves sources as they are and rate-limits per user", async () => {
    const admin = viewer(fan.id, 0, "admin");
    const plain = await issueDownload({ ...fan, rank: 3 }, ids.source, context);
    expect(plain).toMatchObject({
      watermarked: false,
      url: expect.stringContaining("originals/src.psd"),
    });
    for (let i = 0; i < 3; i++) await issueDownload({ ...fan, rank: 3 }, ids.source, context);
    await expectError(issueDownload({ ...fan, rank: 3 }, ids.source, context), "rate_limited");
    // Staff are not limited.
    await expect(issueDownload(admin, ids.source, context)).resolves.toBeTruthy();
  });

  it("finds nothing in an image that never left the site", async () => {
    objects.set(
      "leaks/11111111-1111-4111-8111-111111111111/a.png",
      objects.get("originals/art.png") as Buffer,
    );
    expect(await detectLeak(fan.id, "leaks/11111111-1111-4111-8111-111111111111/a.png")).toEqual({
      found: false,
    });
  }, 120_000);

  it("hands signed-in viewers their own watermarked preview, reused and not rate-limited", async () => {
    const first = await issuePreview(fan, ids.image, context);
    const again = await issuePreview(fan, ids.image, context);
    expect(first).toBe(again);
    expect(first).toContain("derived/");
    const rows = await getDb().select().from(schema.downloads);
    expect(rows).toMatchObject([{ kind: "preview", userId: fan.id }]);
    for (let i = 0; i < 6; i++) await issuePreview(fan, ids.image, context);
    await expect(issueDownload(fan, ids.image, context)).resolves.toBeTruthy();

    // A screenshot of the preview, scaled down, still names the viewer.
    const copy = objects.get(rows[0].derivedKey as string) as Buffer;
    const shot = await sharp(copy).resize(1600).jpeg({ quality: 85 }).toBuffer();
    objects.set("leaks/22222222-2222-4222-8222-222222222222/shot.jpg", shot);
    expect(
      await detectLeak(fan.id, "leaks/22222222-2222-4222-8222-222222222222/shot.jpg"),
    ).toMatchObject({
      found: true,
      kind: "preview",
      user: { id: fan.id },
    });
  }, 120_000);

  it("refuses previews of locked work to guests", async () => {
    await expectError(issuePreview(null, ids.image, context), "unauthorized");
  });
});
