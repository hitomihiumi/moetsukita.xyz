import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { escapeLike, type GalleryQuery } from "@/lib/search";
import { getDb } from "../db";
import { assets, tags, tiers, works, workTags } from "../db/schema";

/** What the current visitor may see: their tier rank and whether they confirmed 18+. */
export type Audience = { rank: number; adult: boolean };

export const PAGE_SIZE = 24;

type TierRow = typeof tiers.$inferSelect;

/** Published, or scheduled and due. */
const isVisible = and(
  inArray(works.status, ["published", "scheduled"]),
  lte(works.publishedAt, sql`now()`),
) as SQL;

/** The work carries the tag, by slug or by one of its aliases. */
const hasTag = (slug: string) => sql`exists (
  select 1 from ${workTags} wt join ${tags} t on t.id = wt.tag_id
  where wt.work_id = ${works.id} and (t.slug = ${slug} or ${slug} = any(t.aliases)))`;

/** Title, description, or any tag name, slug or alias contains the text. */
function matchesText(text: string) {
  const like = `%${escapeLike(text.toLowerCase())}%`;
  return or(
    sql`${works.searchVector} @@ websearch_to_tsquery('simple', ${text})`,
    sql`${works.searchText} like ${like}`,
    sql`exists (
      select 1 from ${workTags} wt join ${tags} t on t.id = wt.tag_id
      where wt.work_id = ${works.id} and (
        t.slug like ${like}
        or lower(concat_ws(' ', t.name->>'en', t.name->>'ru', t.name->>'ja')) like ${like}
        or exists (select 1 from unnest(t.aliases) alias where alias like ${like})))`,
  ) as SQL;
}

export const canOpen = (rank: number, tier: Pick<TierRow, "rank"> | null | undefined) =>
  !tier || tier.rank <= rank;

export async function searchWorks(query: GalleryQuery, audience: Audience) {
  const db = getDb();
  const conditions: SQL[] = [isVisible];

  // NSFW stays out of the results entirely until the visitor confirms 18+.
  if (!audience.adult || query.rating === "sfw") conditions.push(eq(works.rating, "sfw"));
  else if (query.rating === "nsfw") conditions.push(eq(works.rating, "nsfw"));
  if (query.text) conditions.push(matchesText(query.text));
  for (const slug of query.tags) conditions.push(hasTag(slug));
  for (const slug of query.exclude) conditions.push(not(hasTag(slug)));
  if (query.mine) {
    conditions.push(or(isNull(works.minTierId), lte(tiers.rank, audience.rank)) as SQL);
  }
  const where = and(...conditions);

  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(works)
      .leftJoin(tiers, eq(works.minTierId, tiers.id))
      .where(where),
    db
      .select({
        id: works.id,
        slug: works.slug,
        title: works.title,
        rating: works.rating,
        publishedAt: works.publishedAt,
        coverAssetId: works.coverAssetId,
        tier: tiers,
      })
      .from(works)
      .leftJoin(tiers, eq(works.minTierId, tiers.id))
      .where(where)
      .orderBy(
        query.sort === "old" ? asc(works.publishedAt) : desc(works.publishedAt),
        asc(works.id),
      )
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE),
  ]);

  const ids = rows.map((row) => row.id);
  const coverIds = rows.flatMap((row) => (row.coverAssetId ? [row.coverAssetId] : []));
  const [covers, imageCounts] = await Promise.all([
    coverIds.length
      ? db
          .select({
            id: assets.id,
            thumbKey: assets.thumbKey,
            blurKey: assets.blurKey,
            width: assets.width,
            height: assets.height,
          })
          .from(assets)
          .where(inArray(assets.id, coverIds))
      : [],
    ids.length
      ? db
          .select({ workId: assets.workId, count: count() })
          .from(assets)
          .where(
            and(inArray(assets.workId, ids), eq(assets.kind, "image"), eq(assets.status, "ready")),
          )
          .groupBy(assets.workId)
      : [],
  ]);
  const coverById = new Map(covers.map((cover) => [cover.id, cover]));
  const countByWork = new Map(imageCounts.map((row) => [row.workId, row.count]));

  return {
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    items: rows.map((row) => ({
      ...row,
      cover: row.coverAssetId ? (coverById.get(row.coverAssetId) ?? null) : null,
      images: countByWork.get(row.id) ?? 0,
      locked: !canOpen(audience.rank, row.tier),
    })),
  };
}

export type GalleryItem = Awaited<ReturnType<typeof searchWorks>>["items"][number];

/**
 * One visible work by slug, with its ready files and tags, or null. NSFW for a
 * visitor without the 18+ confirmation comes back as `{ ageGate: true }`.
 */
export async function getPublicWork(slug: string, audience: Audience) {
  const db = getDb();
  const [row] = await db
    .select({ work: works, tier: tiers })
    .from(works)
    .leftJoin(tiers, eq(works.minTierId, tiers.id))
    .where(and(eq(works.slug, slug), isVisible));
  if (!row) return null;
  if (row.work.rating === "nsfw" && !audience.adult) return { ageGate: true as const };

  const [files, tagRows, tierRows] = await Promise.all([
    db
      .select()
      .from(assets)
      .where(and(eq(assets.workId, row.work.id), eq(assets.status, "ready")))
      .orderBy(asc(assets.position)),
    db
      .select({ slug: tags.slug, name: tags.name, category: tags.category })
      .from(workTags)
      .innerJoin(tags, eq(workTags.tagId, tags.id))
      .where(eq(workTags.workId, row.work.id))
      .orderBy(asc(tags.category), asc(tags.slug)),
    db.select().from(tiers),
  ]);
  const tierById = new Map(tierRows.map((tier) => [tier.id, tier]));
  const workLocked = !canOpen(audience.rank, row.tier);

  return {
    ageGate: false as const,
    work: row.work,
    tier: row.tier,
    locked: workLocked,
    tags: tagRows,
    files: files.map((file) => {
      // A file can ask for more than its work, never less.
      const fileTier = file.minTierId ? (tierById.get(file.minTierId) ?? null) : null;
      const required =
        fileTier && (!row.tier || fileTier.rank > row.tier.rank) ? fileTier : row.tier;
      return { ...file, tier: required, locked: workLocked || !canOpen(audience.rank, required) };
    }),
  };
}

/** Every tag, for the filter picker. */
export function allTags() {
  return getDb()
    .select({ slug: tags.slug, name: tags.name, category: tags.category })
    .from(tags)
    .orderBy(asc(tags.category), asc(tags.slug));
}

/** Published SFW works for the sitemap; NSFW stays out of search engines. */
export function sitemapWorks() {
  return getDb()
    .select({ slug: works.slug, updatedAt: works.updatedAt })
    .from(works)
    .where(and(isVisible, eq(works.rating, "sfw")))
    .orderBy(desc(works.publishedAt))
    .limit(5000);
}
