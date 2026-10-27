/**
 * Fills an empty database with starter tiers and tags. Safe to run again:
 * existing rows (matched by rank or slug) are left untouched.
 *
 *   npm run db:seed            tiers and tags
 *   npm run db:seed -- --demo  plus a few published demo works, for local development
 *
 * Tier names are placeholders: rename them and map Patreon tiers and the
 * Discord roles of Fanbox plans to them in the admin panel.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("../src/server/db");
  const { tags, tiers, works, workTags } = await import("../src/server/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const db = getDb();

  await db
    .insert(tiers)
    .values([
      {
        rank: 1,
        name: { en: "Supporter", ru: "Поддержка", ja: "サポーター" },
        description: {
          en: "Uncensored works",
          ru: "Работы без цензуры",
          ja: "無修正の作品",
        },
        color: "brand",
      },
      {
        rank: 2,
        name: { en: "Premium", ru: "Премиум", ja: "プレミアム" },
        description: {
          en: "Everything above plus variations and full resolution",
          ru: "Всё выше плюс вариации и полное разрешение",
          ja: "上記すべて+差分・フル解像度",
        },
        color: "accent",
      },
      {
        rank: 3,
        name: { en: "Ultimate", ru: "Максимум", ja: "アルティメット" },
        description: {
          en: "Everything above plus source files (PSD/CLIP)",
          ru: "Всё выше плюс исходники (PSD/CLIP)",
          ja: "上記すべて+元データ(PSD/CLIP)",
        },
        color: "warning",
      },
    ])
    .onConflictDoNothing({ target: tiers.rank });
  console.log("✓ tiers");

  await db
    .insert(tags)
    .values([
      {
        slug: "original",
        name: { en: "Original", ru: "Оригинал", ja: "オリジナル" },
        category: "series",
      },
      {
        slug: "fanart",
        name: { en: "Fan art", ru: "Фанарт", ja: "ファンアート" },
        category: "meta",
        aliases: ["fan art", "фан-арт"],
      },
      {
        slug: "sketch",
        name: { en: "Sketch", ru: "Скетч", ja: "ラフ" },
        category: "meta",
        aliases: ["rough", "набросок"],
      },
      {
        slug: "variations",
        name: { en: "Variations", ru: "Вариации", ja: "差分" },
        category: "meta",
        aliases: ["diff", "sabun"],
      },
      {
        slug: "wip",
        name: { en: "Work in progress", ru: "В процессе", ja: "制作途中" },
        category: "meta",
      },
      {
        slug: "commission",
        name: { en: "Commission", ru: "Комиссия", ja: "依頼" },
        category: "meta",
        aliases: ["comm", "коммишн"],
      },
    ])
    .onConflictDoNothing({ target: tags.slug });
  console.log("✓ tags");

  if (!process.argv.includes("--demo")) return;

  const tierByRank = new Map((await db.select().from(tiers)).map((tier) => [tier.rank, tier.id]));
  const demo = [
    {
      slug: "demo-starry-night",
      title: { en: "Starry night", ru: "Звёздная ночь", ja: "星空" },
      description: { en: "Demo work visible to everyone.", ru: "Демо-работа, видна всем." },
      rating: "sfw" as const,
      rank: null,
      tags: ["original", "sketch"],
    },
    {
      slug: "demo-summer-variations",
      title: { en: "Summer variations", ru: "Летние вариации", ja: "夏の差分" },
      description: { en: "Demo work for the first tier.", ru: "Демо-работа для первого уровня." },
      rating: "nsfw" as const,
      rank: 1,
      tags: ["original", "variations"],
    },
    {
      slug: "demo-commission-sources",
      title: {
        en: "Commission with sources",
        ru: "Комиссия с исходниками",
        ja: "依頼作品(元データ付き)",
      },
      description: { en: "Demo work for the top tier.", ru: "Демо-работа для высшего уровня." },
      rating: "nsfw" as const,
      rank: 3,
      tags: ["fanart", "commission"],
    },
  ];

  for (const [index, item] of demo.entries()) {
    const [work] = await db
      .insert(works)
      .values({
        slug: item.slug,
        title: item.title,
        description: item.description,
        rating: item.rating,
        minTierId: item.rank ? tierByRank.get(item.rank) : null,
        status: "published",
        publishedAt: new Date(Date.now() - index * 86_400_000),
      })
      .onConflictDoNothing({ target: works.slug })
      .returning({ id: works.id });
    if (!work) continue;

    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(inArray(tags.slug, item.tags));
    await db
      .insert(workTags)
      .values(tagRows.map((tag) => ({ workId: work.id, tagId: tag.id })))
      .onConflictDoNothing();
  }
  const count = await db.$count(works, eq(works.status, "published"));
  console.log(`✓ demo works (${count} published)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
