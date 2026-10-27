import "server-only";
import { randomBytes } from "node:crypto";
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { assets, tiers, works, workTags } from "../db/schema";
import { deleteObjects } from "../storage";
import { audit } from "./audit";
import { pgCode, ServiceError, UNIQUE_VIOLATION } from "./errors";
import { parseInput, type WorkInput, workInput } from "./schemas";

export async function listWorks() {
  const db = getDb();
  const rows = await db
    .select({
      id: works.id,
      slug: works.slug,
      title: works.title,
      rating: works.rating,
      status: works.status,
      publishedAt: works.publishedAt,
      updatedAt: works.updatedAt,
      coverAssetId: works.coverAssetId,
      tierName: tiers.name,
      tierRank: tiers.rank,
    })
    .from(works)
    .leftJoin(tiers, eq(works.minTierId, tiers.id))
    .orderBy(desc(works.updatedAt));

  const counts = await db
    .select({ workId: assets.workId, count: count() })
    .from(assets)
    .groupBy(assets.workId);
  const countByWork = new Map(counts.map((row) => [row.workId, row.count]));

  const coverIds = rows.flatMap((row) => (row.coverAssetId ? [row.coverAssetId] : []));
  const covers = coverIds.length
    ? await db
        .select({ id: assets.id, thumbKey: assets.thumbKey })
        .from(assets)
        .where(inArray(assets.id, coverIds))
    : [];
  const thumbByAsset = new Map(covers.map((cover) => [cover.id, cover.thumbKey]));

  return rows.map((row) => ({
    ...row,
    assetCount: countByWork.get(row.id) ?? 0,
    coverThumbKey: row.coverAssetId ? (thumbByAsset.get(row.coverAssetId) ?? null) : null,
  }));
}

export async function getWork(id: string) {
  const db = getDb();
  const [work] = await db.select().from(works).where(eq(works.id, id));
  if (!work) return null;
  const [tagRows, assetRows] = await Promise.all([
    db.select({ tagId: workTags.tagId }).from(workTags).where(eq(workTags.workId, id)),
    db.select().from(assets).where(eq(assets.workId, id)).orderBy(asc(assets.position)),
  ]);
  return { ...work, tagIds: tagRows.map((row) => row.tagId), assets: assetRows };
}

export async function createWork(actorId: string) {
  const [work] = await getDb()
    .insert(works)
    .values({
      slug: `untitled-${randomBytes(3).toString("hex")}`,
      title: { en: "Untitled" },
      createdById: actorId,
    })
    .returning({ id: works.id });
  await audit(actorId, "create", "work", work.id);
  return work.id;
}

export async function updateWork(actorId: string, id: string, raw: WorkInput) {
  const input = parseInput(workInput, raw);
  // Publishing without a date publishes now.
  const publishedAt =
    input.status === "published" ? (input.publishedAt ?? new Date()) : input.publishedAt;

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(works)
        .set({
          slug: input.slug,
          title: input.title,
          description: input.description,
          rating: input.rating,
          minTierId: input.minTierId,
          status: input.status,
          publishedAt,
        })
        .where(eq(works.id, id))
        .returning({ id: works.id });
      if (updated.length === 0) throw new ServiceError("Work not found");

      await tx.delete(workTags).where(eq(workTags.workId, id));
      if (input.tagIds.length > 0) {
        await tx
          .insert(workTags)
          .values([...new Set(input.tagIds)].map((tagId) => ({ workId: id, tagId })));
      }
    });
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      throw new ServiceError("Slug is taken", { slug: "Another work uses this slug" });
    }
    throw error;
  }
  await audit(actorId, "update", "work", id, { ...input, publishedAt });
}

export async function deleteWork(actorId: string, id: string) {
  const db = getDb();
  const files = await db.select().from(assets).where(eq(assets.workId, id));
  const [deleted] = await db.delete(works).where(eq(works.id, id)).returning({ slug: works.slug });
  if (!deleted) return;
  await deleteObjects(
    files.flatMap((file) =>
      [file.storageKey, file.thumbKey, file.previewKey].filter((key): key is string => !!key),
    ),
  );
  await deleteObjects(
    files.flatMap((file) => (file.blurKey ? [file.blurKey] : [])),
    "public",
  );
  await audit(actorId, "delete", "work", id, { slug: deleted.slug });
}
