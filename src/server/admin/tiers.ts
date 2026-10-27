import "server-only";
import { asc, eq } from "drizzle-orm";
import { fetchGuildRoles } from "../access/discord";
import { fetchCampaignTiers } from "../access/patreon";
import { getDb } from "../db";
import { tierMappings, tiers, users } from "../db/schema";
import { discordEnv, isConfigured, patreonEnv } from "../env";
import { audit } from "./audit";
import { FOREIGN_KEY_VIOLATION, pgCode, ServiceError, UNIQUE_VIOLATION } from "./errors";
import { type MappingInput, mappingInput, parseInput, type TierInput, tierInput } from "./schemas";

export async function listTiers() {
  const db = getDb();
  const [tierRows, mappingRows] = await Promise.all([
    db.select().from(tiers).orderBy(asc(tiers.rank)),
    db.select().from(tierMappings).orderBy(asc(tierMappings.source)),
  ]);
  return tierRows.map((tier) => ({
    ...tier,
    mappings: mappingRows.filter((mapping) => mapping.tierId === tier.id),
  }));
}

/** Mappings changed: everyone's tier is re-checked on their next request. */
async function invalidateAccess() {
  await getDb().update(users).set({ accessSyncedAt: null });
}

export async function saveTier(actorId: string, id: string | null, raw: TierInput) {
  const input = parseInput(tierInput, raw);
  const isNew = id === null;
  const db = getDb();
  try {
    if (id) {
      await db.update(tiers).set(input).where(eq(tiers.id, id));
    } else {
      const [tier] = await db.insert(tiers).values(input).returning({ id: tiers.id });
      id = tier.id;
    }
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      throw new ServiceError("Rank is taken", { rank: "Another tier has this rank" });
    }
    throw error;
  }
  await audit(actorId, isNew ? "create" : "update", "tier", id, input);
  await invalidateAccess();
}

export async function deleteTier(actorId: string, id: string) {
  try {
    await getDb().delete(tiers).where(eq(tiers.id, id));
  } catch (error) {
    if (pgCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new ServiceError("Works or files still require this tier; change them first");
    }
    throw error;
  }
  await audit(actorId, "delete", "tier", id);
}

export async function addMapping(actorId: string, raw: MappingInput) {
  const input = parseInput(mappingInput, raw);
  try {
    await getDb().insert(tierMappings).values(input);
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      throw new ServiceError("This role or tier is already mapped");
    }
    throw error;
  }
  await audit(actorId, "map", "tier", input.tierId, input);
  await invalidateAccess();
}

export async function deleteMapping(actorId: string, id: string) {
  const [mapping] = await getDb().delete(tierMappings).where(eq(tierMappings.id, id)).returning();
  if (mapping) await audit(actorId, "unmap", "tier", mapping.tierId, mapping);
  await invalidateAccess();
}

/** Roles and Patreon tiers to pick from; empty when the integration is not configured. */
export async function providerOptions() {
  const [discordRoles, patreonTiers] = await Promise.all([
    isConfigured(discordEnv)
      ? fetchGuildRoles({
          guildId: discordEnv().DISCORD_GUILD_ID,
          botToken: discordEnv().DISCORD_BOT_TOKEN,
        }).catch(() => [])
      : [],
    isConfigured(patreonEnv) && patreonEnv().PATREON_CREATOR_ACCESS_TOKEN
      ? fetchCampaignTiers(
          patreonEnv().PATREON_CAMPAIGN_ID,
          patreonEnv().PATREON_CREATOR_ACCESS_TOKEN as string,
        )
          .then((list) => list.map((tier) => ({ id: tier.id, name: tier.title })))
          .catch(() => [])
      : [],
  ]);
  return { discordRoles, patreonTiers };
}
