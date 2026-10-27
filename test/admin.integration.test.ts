/** Admin services against a real Postgres (TEST_DATABASE_URL); storage calls are mocked. */
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "./helpers";

const url = process.env.TEST_DATABASE_URL;
Object.assign(process.env, { DATABASE_URL: url, OWNER_DISCORD_IDS: "owner-discord" });

vi.mock("@/server/storage", () => ({
  deleteObjects: vi.fn(async () => {}),
  storageKeys: {
    original: (workId: string, assetId: string, name: string) =>
      `originals/${workId}/${assetId}/${name}`,
  },
}));

const { getDb } = await import("@/server/db");
const schema = await import("@/server/db/schema");
const works = await import("@/server/admin/works");
const tags = await import("@/server/admin/tags");
const tiers = await import("@/server/admin/tiers");
const users = await import("@/server/admin/users");
const { renderPreviews } = await import("@/server/admin/assets");
const { ServiceError } = await import("@/server/admin/errors");

let actor: string;

async function newUser(name: string, discordId?: string) {
  const [user] = await getDb().insert(schema.users).values({ name, role: "admin" }).returning();
  if (discordId) {
    await getDb().insert(schema.accounts).values({
      userId: user.id,
      type: "oauth",
      provider: "discord",
      providerAccountId: discordId,
    });
  }
  return user.id;
}

const baseWork = {
  title: { en: "Night" },
  description: {},
  rating: "nsfw" as const,
  minTierId: null,
  status: "draft" as const,
  publishedAt: null,
  tagIds: [],
};

describe.skipIf(!url)("admin services", () => {
  beforeAll(() => resetDatabase(url as string));
  beforeEach(async () => {
    await getDb().execute(
      sql`truncate users, tiers, tags, works, audit_log restart identity cascade`,
    );
    actor = await newUser("Editor");
  });

  it("creates a draft, saves it with tags and records the change", async () => {
    const id = await works.createWork(actor);
    const tag = await tags.createTag(actor, {
      slug: "original",
      name: { en: "Original" },
      category: "series",
      aliases: [],
    });
    await works.updateWork(actor, id, { ...baseWork, slug: "night", tagIds: [tag.id] });
    const saved = await works.getWork(id);
    expect(saved).toMatchObject({ slug: "night", title: { en: "Night" }, tagIds: [tag.id] });
    const log = await getDb().select().from(schema.auditLog);
    expect(log.map((entry) => entry.action)).toEqual(["create", "create", "update"]);
  });

  it("publishes now when no date is given and requires a date for scheduling", async () => {
    const id = await works.createWork(actor);
    await works.updateWork(actor, id, { ...baseWork, slug: "now", status: "published" });
    expect((await works.getWork(id))?.publishedAt).toBeInstanceOf(Date);
    await expect(
      works.updateWork(actor, id, { ...baseWork, slug: "now", status: "scheduled" }),
    ).rejects.toMatchObject({ fieldErrors: { publishedAt: expect.any(String) } });
  });

  it("rejects a taken or malformed slug with a field error", async () => {
    const first = await works.createWork(actor);
    const second = await works.createWork(actor);
    await works.updateWork(actor, first, { ...baseWork, slug: "same" });
    await expect(
      works.updateWork(actor, second, { ...baseWork, slug: "same" }),
    ).rejects.toMatchObject({
      fieldErrors: { slug: expect.any(String) },
    });
    await expect(
      works.updateWork(actor, second, { ...baseWork, slug: "Not A Slug" }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("merges a tag into another, keeping its spellings as aliases", async () => {
    const work = await works.createWork(actor);
    const source = await tags.createTag(actor, {
      slug: "fan-art",
      name: { en: "Fan Art" },
      category: "meta",
      aliases: ["fanart"],
    });
    const target = await tags.createTag(actor, {
      slug: "fanart-tag",
      name: { en: "Fanart" },
      category: "meta",
      aliases: [],
    });
    await works.updateWork(actor, work, { ...baseWork, slug: "w", tagIds: [source.id] });
    await tags.mergeTags(actor, source.id, target.id);

    const list = await tags.listTags();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: target.id, uses: 1 });
    expect(list[0].aliases.sort()).toEqual(["fan art", "fan-art", "fanart"]);
  });

  it("keeps a tier that works still require, and resets access checks on mapping changes", async () => {
    await tiers.saveTier(actor, null, {
      rank: 1,
      name: { en: "Supporter" },
      description: {},
      color: null,
    });
    const [tier] = await tiers.listTiers();
    const work = await works.createWork(actor);
    await works.updateWork(actor, work, { ...baseWork, slug: "locked", minTierId: tier.id });
    await expect(tiers.deleteTier(actor, tier.id)).rejects.toBeInstanceOf(ServiceError);

    await getDb().update(schema.users).set({ accessSyncedAt: new Date() });
    await tiers.addMapping(actor, {
      tierId: tier.id,
      source: "discord_role",
      externalId: "123",
      label: "Fanbox 500",
    });
    const [user] = await getDb().select().from(schema.users);
    expect(user.accessSyncedAt).toBeNull();
    await expect(
      tiers.addMapping(actor, {
        tierId: tier.id,
        source: "discord_role",
        externalId: "123",
        label: null,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("protects owners and the acting admin, and bans end sessions", async () => {
    const owner = await newUser("Owner", "owner-discord");
    const fan = await newUser("Fan");
    await getDb()
      .insert(schema.sessions)
      .values({ sessionToken: "fan-session", userId: fan, expires: new Date(Date.now() + 1e7) });
    const update = {
      role: "user" as const,
      banned: true,
      banReason: "leak",
      manualTierId: null,
      manualExpiresAt: null,
    };

    await expect(users.updateUser(actor, owner, update)).rejects.toBeInstanceOf(ServiceError);
    await expect(users.updateUser(actor, actor, update)).rejects.toBeInstanceOf(ServiceError);

    await users.updateUser(actor, fan, update);
    const [banned] = await getDb().select().from(schema.users).where(eq(schema.users.id, fan));
    expect(banned.bannedAt).toBeInstanceOf(Date);
    expect(await getDb().select().from(schema.sessions)).toHaveLength(0);
  });

  it("grants and removes a manual tier", async () => {
    await tiers.saveTier(actor, null, {
      rank: 2,
      name: { en: "Premium" },
      description: {},
      color: null,
    });
    const [tier] = await tiers.listTiers();
    const fan = await newUser("Fan");
    const grant = { role: "user" as const, banned: false, banReason: null, manualExpiresAt: null };
    await users.updateUser(actor, fan, { ...grant, manualTierId: tier.id });
    expect((await users.listUsers()).find((u) => u.id === fan)?.sources).toMatchObject([
      { source: "manual", rank: 2 },
    ]);
    await users.updateUser(actor, fan, { ...grant, manualTierId: null });
    expect((await users.listUsers()).find((u) => u.id === fan)?.sources).toEqual([]);
  });
});

describe("renderPreviews", () => {
  it("builds a thumbnail, a viewer image and a tiny blur from an image", async () => {
    const original = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#808080" },
    })
      .png()
      .toBuffer();
    const previews = await renderPreviews(original);
    expect(previews).toMatchObject({ width: 3000, height: 2000 });
    expect((await sharp(previews.thumb).metadata()).width).toBe(640);
    expect((await sharp(previews.preview).metadata()).width).toBe(2048);
    expect((await sharp(previews.blur).metadata()).width).toBe(24);
  });
});
