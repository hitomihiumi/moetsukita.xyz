import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { syncUserIfStale } from "../access/sync";
import { entitlementsOf, type Tier } from "../access/tiers";
import { getDb } from "../db";
import { accounts, users } from "../db/schema";
import { auth } from ".";
import { hasRole, type Role } from "./roles";

export type Viewer = {
  id: string;
  name: string | null;
  image: string | null;
  role: Role;
  ageConfirmed: boolean;
  /** The best tier across all sources, or null for a free account. */
  tier: Tier | null;
  /** Rank to compare against content: 0 without a tier. */
  rank: number;
  /** Where each tier comes from, best first. */
  sources: { source: "patreon" | "discord" | "manual"; tier: Tier; expiresAt: Date | null }[];
  accessSyncedAt: Date | null;
  /** Sign-in providers linked to this user. */
  providers: string[];
};

export { hasRole } from "./roles";

/**
 * The signed-in user with their current tier, once per request. Re-checks the
 * tier with Discord and Patreon when the last check is older than an hour.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user || user.bannedAt) return null;

  let syncedAt = user.accessSyncedAt;
  try {
    if (await syncUserIfStale(user)) syncedAt = new Date();
  } catch (error) {
    // Serve the last known tier rather than an error page.
    console.error("[access] lazy sync failed", error);
  }

  const [sources, linked] = await Promise.all([
    entitlementsOf(user.id),
    db.select({ provider: accounts.provider }).from(accounts).where(eq(accounts.userId, user.id)),
  ]);
  const tier = sources[0]?.tier ?? null;
  return {
    id: user.id,
    name: user.name,
    image: user.image,
    role: user.role,
    ageConfirmed: user.ageConfirmedAt !== null,
    tier,
    rank: tier?.rank ?? 0,
    sources,
    accessSyncedAt: syncedAt,
    providers: linked.map((account) => account.provider),
  };
});

export class AccessDeniedError extends Error {}

/** For server actions and route handlers: the viewer, or an error when the role is missing. */
export async function requireRole(role: Role) {
  const viewer = await getViewer();
  if (!hasRole(viewer, role)) throw new AccessDeniedError(`Requires ${role}`);
  return viewer as Viewer;
}
