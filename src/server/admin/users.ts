import "server-only";
import { count, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { syncUser } from "../access/sync";
import { setEntitlement } from "../access/tiers";
import { getDb } from "../db";
import { accounts, entitlements, sessions, tiers, users, works } from "../db/schema";
import { authEnv } from "../env";
import { audit } from "./audit";
import { ServiceError } from "./errors";
import { parseInput, type UserUpdateInput, userUpdateInput } from "./schemas";

export async function listUsers() {
  const db = getDb();
  const [userRows, accountRows, grantRows] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db
      .select({
        userId: accounts.userId,
        provider: accounts.provider,
        providerAccountId: accounts.providerAccountId,
      })
      .from(accounts),
    db
      .select({
        userId: entitlements.userId,
        source: entitlements.source,
        expiresAt: entitlements.expiresAt,
        tier: tiers,
      })
      .from(entitlements)
      .innerJoin(tiers, eq(entitlements.tierId, tiers.id))
      .where(or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())))
      .orderBy(desc(tiers.rank)),
  ]);
  const owners = new Set(authEnv().OWNER_DISCORD_IDS);
  return userRows.map((user) => {
    const linked = accountRows.filter((account) => account.userId === user.id);
    const sources = grantRows.filter((grant) => grant.userId === user.id);
    return {
      id: user.id,
      name: user.name,
      image: user.image,
      role: user.role,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      createdAt: user.createdAt,
      accessSyncedAt: user.accessSyncedAt,
      providers: linked.map((account) => account.provider),
      owner: linked.some(
        (account) => account.provider === "discord" && owners.has(account.providerAccountId),
      ),
      sources: sources.map((entry) => ({
        source: entry.source,
        tierId: entry.tier.id,
        tierName: entry.tier.name,
        rank: entry.tier.rank,
        expiresAt: entry.expiresAt,
      })),
    };
  });
}

export type AdminUser = Awaited<ReturnType<typeof listUsers>>[number];

export async function updateUser(actorId: string, userId: string, raw: UserUpdateInput) {
  const input = parseInput(userUpdateInput, raw);
  const db = getDb();
  const target = (await listUsers()).find((user) => user.id === userId);
  if (!target) throw new ServiceError("User not found");

  if (target.owner && (input.role !== "admin" || input.banned)) {
    throw new ServiceError("Owners (OWNER_DISCORD_IDS) stay admins and cannot be banned");
  }
  if (userId === actorId && (input.role !== "admin" || input.banned)) {
    throw new ServiceError("You cannot demote or ban yourself");
  }

  await db
    .update(users)
    .set({
      role: input.role,
      bannedAt: input.banned ? (target.bannedAt ?? new Date()) : null,
      banReason: input.banned ? input.banReason : null,
    })
    .where(eq(users.id, userId));
  // A ban ends every session at once.
  if (input.banned) await db.delete(sessions).where(eq(sessions.userId, userId));

  await setEntitlement(
    userId,
    "manual",
    input.manualTierId
      ? { tierId: input.manualTierId, externalRef: actorId, expiresAt: input.manualExpiresAt }
      : null,
  );
  await audit(actorId, "update", "user", userId, input);
}

export async function syncUserNow(actorId: string, userId: string) {
  await syncUser(userId);
  await audit(actorId, "sync", "user", userId);
}

export async function overview() {
  const db = getDb();
  const [workCounts, [userCount], tierCounts] = await Promise.all([
    db.select({ status: works.status, count: count() }).from(works).groupBy(works.status),
    db.select({ count: count() }).from(users),
    db
      .select({ tierId: entitlements.tierId, count: count() })
      .from(entitlements)
      .where(inArray(entitlements.source, ["discord", "patreon", "manual"]))
      .groupBy(entitlements.tierId),
  ]);
  return {
    works: Object.fromEntries(workCounts.map((row) => [row.status, row.count])) as Partial<
      Record<"draft" | "scheduled" | "published", number>
    >,
    users: userCount.count,
    entitlementsByTier: new Map(tierCounts.map((row) => [row.tierId, row.count])),
  };
}
