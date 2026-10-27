/**
 * Entitlement sync against a real Postgres, with Discord and Patreon mocked at
 * the fetch level. Needs TEST_DATABASE_URL (a throwaway database: it is wiped).
 *
 *   TEST_DATABASE_URL=postgres://moetsukita:moetsukita@localhost:5432/moetsukita_test npm test
 */
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "./helpers";

const url = process.env.TEST_DATABASE_URL;

Object.assign(process.env, {
  DATABASE_URL: url,
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_GUILD_ID: "guild",
  PATREON_CAMPAIGN_ID: "campaign",
  PATREON_WEBHOOK_SECRET: "hook-secret",
  AUTH_PATREON_ID: "client",
  AUTH_PATREON_SECRET: "client-secret",
  // Read once and cached, like in the app; only the scheduled pass uses it.
  PATREON_CREATOR_ACCESS_TOKEN: "creator-token",
});

const { getDb } = await import("@/server/db");
const schema = await import("@/server/db/schema");
const sync = await import("@/server/access/sync");
const { entitlementsOf } = await import("@/server/access/tiers");

type Handler = (url: string, init?: RequestInit) => Response | undefined;
let handlers: Handler[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Routes fetch calls to the first handler that answers; anything unexpected fails the test. */
function mockApis(...list: Handler[]) {
  handlers = list;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      for (const handler of handlers) {
        const response = handler(String(input), init);
        if (response) return response;
      }
      throw new Error(`Unexpected request: ${input}`);
    }),
  );
}

const discordMember =
  (userId: string, roles: string[] | null): Handler =>
  (requestUrl) => {
    if (!requestUrl.endsWith(`/guilds/guild/members/${userId}`)) return undefined;
    return roles ? json({ roles }) : json({ code: 10007 }, 404);
  };

const patreonIdentity =
  (token: string, status: string, tiers: string[]): Handler =>
  (requestUrl, init) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (!requestUrl.includes("/v2/identity") || auth !== `Bearer ${token}`) return undefined;
    return json({
      data: { id: "patreon-user", type: "user" },
      included: [
        {
          id: "member",
          type: "member",
          attributes: { patron_status: status },
          relationships: {
            campaign: { data: { id: "campaign", type: "campaign" } },
            currently_entitled_tiers: { data: tiers.map((id) => ({ id, type: "tier" })) },
          },
        },
      ],
    });
  };

const tierIds: Record<number, string> = {};
let userId: string;

async function linkAccount(provider: "discord" | "patreon", providerAccountId: string, extra = {}) {
  await getDb()
    .insert(schema.accounts)
    .values({ userId, type: "oauth", provider, providerAccountId, ...extra });
}

async function tierRanksBySource() {
  const rows = await entitlementsOf(userId);
  return Object.fromEntries(rows.map((row) => [row.source, row.tier.rank]));
}

describe.skipIf(!url)("entitlement sync", () => {
  beforeAll(() => resetDatabase(url as string));

  beforeEach(async () => {
    const db = getDb();
    await db.execute(sql`truncate users, tiers restart identity cascade`);
    const rows = await db
      .insert(schema.tiers)
      .values([1, 2, 3].map((rank) => ({ rank, name: { en: `Tier ${rank}` } })))
      .returning();
    for (const tier of rows) tierIds[tier.rank] = tier.id;
    await db.insert(schema.tierMappings).values([
      { source: "discord_role", externalId: "role-fanbox-500", tierId: tierIds[1] },
      { source: "discord_role", externalId: "role-fanbox-1500", tierId: tierIds[2] },
      { source: "patreon_tier", externalId: "patreon-tier-gold", tierId: tierIds[3] },
    ]);
    const [user] = await db.insert(schema.users).values({ name: "Fan" }).returning();
    userId = user.id;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("grants the best tier among the member's Discord roles", async () => {
    await linkAccount("discord", "discord-user");
    mockApis(discordMember("discord-user", ["unrelated", "role-fanbox-500", "role-fanbox-1500"]));
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({ discord: 2 });
  });

  it("revokes the tier when the member leaves the server", async () => {
    await linkAccount("discord", "discord-user");
    mockApis(discordMember("discord-user", ["role-fanbox-500"]));
    await sync.syncUser(userId);
    mockApis(discordMember("discord-user", null));
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({});
  });

  it("keeps the tier through a Discord outage", async () => {
    await linkAccount("discord", "discord-user");
    mockApis(discordMember("discord-user", ["role-fanbox-500"]));
    await sync.syncUser(userId);
    mockApis((requestUrl) => (requestUrl.includes("discord.com") ? json({}, 503) : undefined));
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({ discord: 1 });
  });

  it("combines sources: the best tier wins and each source is listed", async () => {
    await linkAccount("discord", "discord-user");
    await linkAccount("patreon", "patreon-user", {
      access_token: "live-token",
      expires_at: 2_000_000_000,
    });
    mockApis(
      discordMember("discord-user", ["role-fanbox-500"]),
      patreonIdentity("live-token", "active_patron", ["patreon-tier-gold"]),
    );
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({ discord: 1, patreon: 3 });
    expect((await entitlementsOf(userId))[0].tier.rank).toBe(3);
  });

  it("gives nothing for a declined Patreon payment", async () => {
    await linkAccount("patreon", "patreon-user", {
      access_token: "live-token",
      expires_at: 2_000_000_000,
    });
    mockApis(patreonIdentity("live-token", "declined_patron", ["patreon-tier-gold"]));
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({});
  });

  it("refreshes an expired Patreon token and stores the new one", async () => {
    await linkAccount("patreon", "patreon-user", {
      access_token: "old-token",
      refresh_token: "refresh-1",
      expires_at: 1,
    });
    mockApis(
      (requestUrl, init) =>
        requestUrl.endsWith("/oauth2/token") &&
        String(init?.body).includes("refresh_token=refresh-1")
          ? json({ access_token: "new-token", refresh_token: "refresh-2", expires_in: 3600 })
          : undefined,
      patreonIdentity("new-token", "active_patron", ["patreon-tier-gold"]),
    );
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({ patreon: 3 });
    const [account] = await getDb().select().from(schema.accounts);
    expect(account.access_token).toBe("new-token");
    expect(account.refresh_token).toBe("refresh-2");
  });

  it("drops the Patreon tier when the user revoked the app", async () => {
    await linkAccount("patreon", "patreon-user", {
      access_token: "live-token",
      expires_at: 2_000_000_000,
    });
    mockApis(patreonIdentity("live-token", "active_patron", ["patreon-tier-gold"]));
    await sync.syncUser(userId);
    mockApis((requestUrl) => (requestUrl.includes("patreon.com") ? json({}, 401) : undefined));
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({});
  });

  it("drops a source's tier once its account is unlinked", async () => {
    await linkAccount("discord", "discord-user");
    mockApis(discordMember("discord-user", ["role-fanbox-500"]));
    await sync.syncUser(userId);
    await getDb().delete(schema.accounts);
    await sync.syncUser(userId);
    expect(await tierRanksBySource()).toEqual({});
  });

  it("only re-syncs when the last check is stale", async () => {
    await linkAccount("discord", "discord-user");
    mockApis(discordMember("discord-user", ["role-fanbox-500"]));
    expect(await sync.syncUserIfStale({ id: userId, accessSyncedAt: null })).toBe(true);
    expect(await sync.syncUserIfStale({ id: userId, accessSyncedAt: new Date() })).toBe(false);
  });

  it("applies a pledge webhook to the linked user", async () => {
    await linkAccount("patreon", "patreon-user");
    const applied = await sync.applyPatreonWebhook({
      patreonUserId: "patreon-user",
      active: true,
      tierIds: ["patreon-tier-gold"],
    });
    expect(applied).toBe(true);
    expect(await tierRanksBySource()).toEqual({ patreon: 3 });
    await sync.applyPatreonWebhook({ patreonUserId: "patreon-user", active: false, tierIds: [] });
    expect(await tierRanksBySource()).toEqual({});
    expect(
      await sync.applyPatreonWebhook({ patreonUserId: "stranger", active: true, tierIds: [] }),
    ).toBe(false);
  });

  it("uses the creator token for the scheduled pass", async () => {
    {
      await linkAccount("patreon", "patreon-user");
      mockApis((requestUrl) =>
        requestUrl.includes("/campaigns/campaign/members")
          ? json({
              data: [
                {
                  id: "m",
                  type: "member",
                  attributes: { patron_status: "active_patron" },
                  relationships: {
                    user: { data: { id: "patreon-user", type: "user" } },
                    currently_entitled_tiers: { data: [{ id: "patreon-tier-gold", type: "tier" }] },
                  },
                },
              ],
              links: {},
            })
          : undefined,
      );
      const stats = await sync.syncAllUsers();
      expect(stats).toMatchObject({ users: 1, patreon: 1 });
      expect(await tierRanksBySource()).toEqual({ patreon: 3 });
    }
  });
});

describe("patreon webhook signature helper", () => {
  it("matches what Patreon sends", async () => {
    const { verifyWebhookSignature } = await import("@/server/access/patreon");
    const body = "{}";
    const signature = createHmac("md5", "hook-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, "hook-secret")).toBe(true);
  });
});
