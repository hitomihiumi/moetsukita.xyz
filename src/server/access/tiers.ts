import "server-only";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import { entitlements, tierMappings, tiers } from "../db/schema";

export type Tier = typeof tiers.$inferSelect;
export type EntitlementSource = (typeof entitlements.$inferSelect)["source"];
type MappingSource = (typeof tierMappings.$inferSelect)["source"];

/** The highest-ranked of the tiers, or null for none. */
export function highestTier<T extends { rank: number }>(candidates: T[]): T | null {
  return candidates.reduce<T | null>(
    (best, tier) => (best === null || tier.rank > best.rank ? tier : best),
    null,
  );
}

/** The best tier the given Patreon tiers or Discord roles map to. */
export async function tierForExternalIds(source: MappingSource, externalIds: string[]) {
  if (externalIds.length === 0) return null;
  const rows = await getDb()
    .select({ tier: tiers, externalId: tierMappings.externalId })
    .from(tierMappings)
    .innerJoin(tiers, eq(tierMappings.tierId, tiers.id))
    .where(and(eq(tierMappings.source, source), inArray(tierMappings.externalId, externalIds)));
  const best = highestTier(rows.map((row) => ({ ...row.tier, externalId: row.externalId })));
  return best && { tier: best, externalId: best.externalId };
}

/** Records the tier a user holds through one source; null removes it. */
export async function setEntitlement(
  userId: string,
  source: EntitlementSource,
  grant: { tierId: string; externalRef?: string | null; expiresAt?: Date | null } | null,
) {
  const db = getDb();
  if (!grant) {
    await db
      .delete(entitlements)
      .where(and(eq(entitlements.userId, userId), eq(entitlements.source, source)));
    return;
  }
  const values = {
    tierId: grant.tierId,
    externalRef: grant.externalRef ?? null,
    expiresAt: grant.expiresAt ?? null,
    syncedAt: new Date(),
  };
  await db
    .insert(entitlements)
    .values({ userId, source, ...values })
    .onConflictDoUpdate({ target: [entitlements.userId, entitlements.source], set: values });
}

/** Every unexpired entitlement of the user with its tier, best first. */
export async function entitlementsOf(userId: string) {
  return getDb()
    .select({ source: entitlements.source, expiresAt: entitlements.expiresAt, tier: tiers })
    .from(entitlements)
    .innerJoin(tiers, eq(entitlements.tierId, tiers.id))
    .where(
      and(
        eq(entitlements.userId, userId),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(tiers.rank));
}
