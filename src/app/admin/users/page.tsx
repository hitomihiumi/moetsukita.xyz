import type { Metadata } from "next";
import { UsersTable } from "@/components/admin";
import { pickLocalized } from "@/lib/localized";
import { requirePageRole } from "@/server/admin/guard";
import { listTiers } from "@/server/admin/tiers";
import { listUsers } from "@/server/admin/users";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const viewer = await requirePageRole("admin");
  const [users, tiers] = await Promise.all([listUsers(), listTiers()]);
  return (
    <UsersTable
      viewerId={viewer.id}
      tiers={tiers.map((tier) => ({ id: tier.id, label: pickLocalized(tier.name, "en") }))}
      users={users.map((user) => ({
        id: user.id,
        name: user.name ?? "—",
        image: user.image,
        role: user.role,
        owner: user.owner,
        banned: user.bannedAt !== null,
        banReason: user.banReason,
        providers: user.providers,
        createdAt: user.createdAt.toISOString(),
        sources: user.sources.map((source) => ({
          source: source.source,
          tierId: source.tierId,
          tier: pickLocalized(source.tierName, "en"),
          rank: source.rank,
          expiresAt: source.expiresAt?.toISOString() ?? null,
        })),
      }))}
    />
  );
}
