import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { auditLog, users } from "../db/schema";

export async function audit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string | null,
  diff?: unknown,
) {
  await getDb()
    .insert(auditLog)
    .values({ actorId, action, entity, entityId, diff: diff ?? null });
}

export function recentAudit(limit = 200) {
  return getDb()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      diff: auditLog.diff,
      createdAt: auditLog.createdAt,
      actor: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
