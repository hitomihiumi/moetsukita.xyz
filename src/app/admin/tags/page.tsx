import type { Metadata } from "next";
import { TagsManager } from "@/components/admin";
import { requirePageRole } from "@/server/admin/guard";
import { listTags } from "@/server/admin/tags";

export const metadata: Metadata = { title: "Tags" };

export default async function TagsPage() {
  await requirePageRole("editor");
  const tags = await listTags();
  return (
    <TagsManager
      tags={tags.map((tag) => ({
        id: tag.id,
        slug: tag.slug,
        name: tag.name,
        category: tag.category,
        aliases: tag.aliases,
        uses: tag.uses,
      }))}
    />
  );
}
