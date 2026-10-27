import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { tags, workTags } from "../db/schema";
import { audit } from "./audit";
import { pgCode, ServiceError, UNIQUE_VIOLATION } from "./errors";
import { parseInput, type TagInput, tagInput } from "./schemas";

export async function listTags() {
  const db = getDb();
  const usage = db
    .select({ tagId: workTags.tagId, uses: count().as("uses") })
    .from(workTags)
    .groupBy(workTags.tagId)
    .as("usage");
  const rows = await db
    .select({ tag: tags, uses: usage.uses })
    .from(tags)
    .leftJoin(usage, eq(usage.tagId, tags.id))
    .orderBy(asc(tags.category), asc(tags.slug));
  return rows.map((row) => ({ ...row.tag, uses: Number(row.uses ?? 0) }));
}

function parse(raw: TagInput) {
  const input = parseInput(tagInput, raw);
  return { ...input, aliases: [...new Set(input.aliases)] };
}

function rethrowSlug(error: unknown): never {
  if (pgCode(error) === UNIQUE_VIOLATION) {
    throw new ServiceError("Slug is taken", { slug: "Another tag uses this slug" });
  }
  throw error;
}

export async function createTag(actorId: string, raw: TagInput) {
  const input = parse(raw);
  const [tag] = await getDb().insert(tags).values(input).returning().catch(rethrowSlug);
  await audit(actorId, "create", "tag", tag.id, input);
  return tag;
}

export async function updateTag(actorId: string, id: string, raw: TagInput) {
  const input = parse(raw);
  await getDb().update(tags).set(input).where(eq(tags.id, id)).catch(rethrowSlug);
  await audit(actorId, "update", "tag", id, input);
}

export async function deleteTag(actorId: string, id: string) {
  const [tag] = await getDb().delete(tags).where(eq(tags.id, id)).returning({ slug: tags.slug });
  if (tag) await audit(actorId, "delete", "tag", id, tag);
}

/** Moves every use of `sourceId` to `targetId`, keeps its spellings as aliases, deletes it. */
export async function mergeTags(actorId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new ServiceError("Pick a different tag");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [source] = await tx.select().from(tags).where(eq(tags.id, sourceId));
    const [target] = await tx.select().from(tags).where(eq(tags.id, targetId));
    if (!source || !target) throw new ServiceError("Tag not found");

    await tx.execute(sql`
      insert into work_tags (work_id, tag_id)
      select work_id, ${targetId} from work_tags where tag_id = ${sourceId}
      on conflict do nothing`);
    const aliases = new Set([...target.aliases, ...source.aliases, source.slug]);
    for (const name of Object.values(source.name)) if (name) aliases.add(name.toLowerCase());
    aliases.delete(target.slug);
    await tx
      .update(tags)
      .set({ aliases: [...aliases] })
      .where(eq(tags.id, targetId));
    await tx.delete(tags).where(eq(tags.id, sourceId));
  });
  await audit(actorId, "merge", "tag", targetId, { from: sourceId });
}
