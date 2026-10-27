import type { Metadata } from "next";
import { TiersManager } from "@/components/admin";
import { requirePageRole } from "@/server/admin/guard";
import { listTiers, providerOptions } from "@/server/admin/tiers";

export const metadata: Metadata = { title: "Tiers" };

export default async function TiersPage() {
  await requirePageRole("admin");
  const [tiers, options] = await Promise.all([listTiers(), providerOptions()]);
  return (
    <TiersManager
      tiers={tiers.map((tier) => ({
        id: tier.id,
        rank: tier.rank,
        name: tier.name,
        description: tier.description,
        color: tier.color,
        mappings: tier.mappings.map((mapping) => ({
          id: mapping.id,
          source: mapping.source,
          externalId: mapping.externalId,
          label: mapping.label,
        })),
      }))}
      discordRoles={options.discordRoles}
      patreonTiers={options.patreonTiers}
    />
  );
}
