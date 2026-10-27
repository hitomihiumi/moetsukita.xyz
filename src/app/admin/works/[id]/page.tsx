import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssetManager, WorkForm } from "@/components/admin";
import { pickLocalized } from "@/lib/localized";
import { requirePageRole } from "@/server/admin/guard";
import { listTags } from "@/server/admin/tags";
import { listTiers } from "@/server/admin/tiers";
import { getWork } from "@/server/admin/works";
import { previewUrl } from "@/server/storage";

// Building previews of a large image runs inside the upload's server action.
export const maxDuration = 300;

export const metadata: Metadata = { title: "Edit work" };

export default async function EditWorkPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("editor");
  const { id } = await params;
  const work = /^[0-9a-f-]{36}$/.test(id) ? await getWork(id) : null;
  if (!work) notFound();

  const [tiers, tags, assets] = await Promise.all([
    listTiers(),
    listTags(),
    Promise.all(
      work.assets.map(async (asset) => ({
        id: asset.id,
        kind: asset.kind,
        status: asset.status,
        filename: asset.filename,
        size: asset.size,
        width: asset.width,
        height: asset.height,
        minTierId: asset.minTierId,
        thumb: await previewUrl(asset.thumbKey),
      })),
    ),
  ]);
  const tierOptions = tiers.map((tier) => ({
    id: tier.id,
    label: `${pickLocalized(tier.name, "en")} (rank ${tier.rank})`,
  }));

  return (
    <>
      <WorkForm
        work={{
          id: work.id,
          slug: work.slug,
          title: work.title,
          description: work.description,
          rating: work.rating,
          minTierId: work.minTierId,
          status: work.status,
          publishedAt: work.publishedAt?.toISOString() ?? null,
          tagIds: work.tagIds,
        }}
        tiers={tierOptions}
        tags={tags.map((tag) => ({
          id: tag.id,
          label: `${pickLocalized(tag.name, "en")} · ${tag.category}`,
        }))}
      />
      <AssetManager
        workId={work.id}
        coverAssetId={work.coverAssetId}
        assets={assets}
        tiers={tierOptions}
      />
    </>
  );
}
