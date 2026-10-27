import type { Metadata } from "next";
import { WorksTable } from "@/components/admin";
import { pickLocalized } from "@/lib/localized";
import { requirePageRole } from "@/server/admin/guard";
import { listWorks } from "@/server/admin/works";
import { previewUrl } from "@/server/storage";

export const metadata: Metadata = { title: "Works" };

export default async function WorksPage() {
  await requirePageRole("editor");
  const works = await listWorks();
  const rows = await Promise.all(
    works.map(async (work) => ({
      id: work.id,
      slug: work.slug,
      title: pickLocalized(work.title, "en"),
      rating: work.rating,
      status: work.status,
      tier: work.tierName ? pickLocalized(work.tierName, "en") : null,
      assetCount: work.assetCount,
      updatedAt: work.updatedAt.toISOString(),
      publishedAt: work.publishedAt?.toISOString() ?? null,
      thumb: await previewUrl(work.coverThumbKey),
    })),
  );
  return <WorksTable works={rows} />;
}
