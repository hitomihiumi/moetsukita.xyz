import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, users } from "../db/schema";
import { authEnv, discordEnv, isConfigured, patreonEnv } from "../env";
import { DiscordUnavailableError, fetchMemberRoles } from "./discord";
import {
  fetchCampaignMemberships,
  fetchIdentity,
  membershipFromIdentity,
  PatreonAuthError,
  type PatreonMembership,
  refreshAccessToken,
} from "./patreon";
import { setEntitlement, tierForExternalIds } from "./tiers";

type Account = typeof accounts.$inferSelect;

/** How long a user's tier is trusted before the next request re-checks it. */
export const SYNC_MAX_AGE_MS = 60 * 60 * 1000;
/** The manual "refresh" button is ignored when used more often than this. */
export const SYNC_MIN_INTERVAL_MS = 60 * 1000;

export async function applyDiscordRoles(userId: string, roles: string[] | null) {
  const match = await tierForExternalIds("discord_role", roles ?? []);
  await setEntitlement(
    userId,
    "discord",
    match && { tierId: match.tier.id, externalRef: match.externalId },
  );
}

export async function applyPatreonMembership(userId: string, membership: PatreonMembership | null) {
  const match = membership?.active
    ? await tierForExternalIds("patreon_tier", membership.tierIds)
    : null;
  await setEntitlement(
    userId,
    "patreon",
    match && { tierId: match.tier.id, externalRef: match.externalId },
  );
}

async function syncDiscord(account: Account) {
  if (!isConfigured(discordEnv)) return;
  const env = discordEnv();
  try {
    const roles = await fetchMemberRoles({
      guildId: env.DISCORD_GUILD_ID,
      userId: account.providerAccountId,
      botToken: env.DISCORD_BOT_TOKEN,
    });
    await applyDiscordRoles(account.userId, roles);
  } catch (error) {
    // An outage says nothing about the member: keep the tier they had.
    if (!(error instanceof DiscordUnavailableError)) throw error;
    console.warn(`[access] discord sync skipped for ${account.userId}: ${error.message}`);
  }
}

/** A valid access token for the account, refreshing (and storing) it when expired. */
async function patreonAccessToken(account: Account) {
  const now = Math.floor(Date.now() / 1000);
  if (account.access_token && (!account.expires_at || account.expires_at > now + 60)) {
    return account.access_token;
  }
  const { AUTH_PATREON_ID, AUTH_PATREON_SECRET } = authEnv();
  if (!account.refresh_token || !AUTH_PATREON_ID || !AUTH_PATREON_SECRET) {
    throw new PatreonAuthError("No usable Patreon token");
  }
  const tokens = await refreshAccessToken({
    refreshToken: account.refresh_token,
    clientId: AUTH_PATREON_ID,
    clientSecret: AUTH_PATREON_SECRET,
  });
  await getDb()
    .update(accounts)
    .set({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
    })
    .where(
      and(
        eq(accounts.provider, "patreon"),
        eq(accounts.providerAccountId, account.providerAccountId),
      ),
    );
  return tokens.accessToken;
}

async function syncPatreon(account: Account) {
  if (!isConfigured(patreonEnv)) return;
  const { PATREON_CAMPAIGN_ID } = patreonEnv();
  try {
    const identity = await fetchIdentity(await patreonAccessToken(account));
    await applyPatreonMembership(
      account.userId,
      membershipFromIdentity(identity, PATREON_CAMPAIGN_ID),
    );
  } catch (error) {
    if (error instanceof PatreonAuthError) {
      // The user revoked the app or the token is gone: nothing proves a pledge any more.
      await applyPatreonMembership(account.userId, null);
      return;
    }
    console.warn(
      `[access] patreon sync skipped for ${account.userId}: ${(error as Error).message}`,
    );
  }
}

/**
 * Re-checks a user's tiers with every linked provider. Sources without a
 * linked account lose their entitlement (e.g. after unlinking).
 */
export async function syncUser(userId: string) {
  const db = getDb();
  const linked = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const discord = linked.find((account) => account.provider === "discord");
  const patreon = linked.find((account) => account.provider === "patreon");

  await Promise.all([
    discord ? syncDiscord(discord) : setEntitlement(userId, "discord", null),
    patreon ? syncPatreon(patreon) : setEntitlement(userId, "patreon", null),
  ]);
  await db.update(users).set({ accessSyncedAt: new Date() }).where(eq(users.id, userId));
}

/** Syncs when the last check is older than `maxAgeMs`; returns whether it ran. */
export async function syncUserIfStale(
  user: { id: string; accessSyncedAt: Date | null },
  maxAgeMs = SYNC_MAX_AGE_MS,
) {
  if (user.accessSyncedAt && Date.now() - user.accessSyncedAt.getTime() < maxAgeMs) return false;
  await syncUser(user.id);
  return true;
}

/** The scheduled pass over everyone who has linked a provider. */
export async function syncAllUsers() {
  const db = getDb();
  const linked = await db
    .select()
    .from(accounts)
    .where(inArray(accounts.provider, ["discord", "patreon"]));
  const stats = { users: new Set(linked.map((a) => a.userId)).size, discord: 0, patreon: 0 };

  // With the creator token one listing covers every patron, without user tokens.
  let campaign: Map<string, PatreonMembership> | null = null;
  if (isConfigured(patreonEnv) && patreonEnv().PATREON_CREATOR_ACCESS_TOKEN) {
    const { PATREON_CAMPAIGN_ID, PATREON_CREATOR_ACCESS_TOKEN } = patreonEnv();
    const memberships = await fetchCampaignMemberships(
      PATREON_CAMPAIGN_ID,
      PATREON_CREATOR_ACCESS_TOKEN as string,
    );
    campaign = new Map(memberships.map((m) => [m.patreonUserId, m]));
  }

  for (const account of linked) {
    if (account.provider === "discord") {
      await syncDiscord(account);
      stats.discord++;
    } else if (campaign) {
      await applyPatreonMembership(account.userId, campaign.get(account.providerAccountId) ?? null);
      stats.patreon++;
    } else {
      await syncPatreon(account);
      stats.patreon++;
    }
  }
  if (linked.length > 0) {
    await db
      .update(users)
      .set({ accessSyncedAt: new Date() })
      .where(inArray(users.id, [...new Set(linked.map((a) => a.userId))]));
  }
  return stats;
}

/** Applies a Patreon webhook to the user who linked that Patreon account, if any. */
export async function applyPatreonWebhook(membership: PatreonMembership) {
  const [account] = await getDb()
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, "patreon"),
        eq(accounts.providerAccountId, membership.patreonUserId),
      ),
    );
  if (!account) return false;
  await applyPatreonMembership(account.userId, membership);
  return true;
}
