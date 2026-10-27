import { Column, Grid, Heading, Row, Table, Tag, Text } from "@once-ui-system/core";
import { PageHeader } from "@/components/admin";
import { pickLocalized } from "@/lib/localized";
import { recentAudit } from "@/server/admin/audit";
import { requirePageRole } from "@/server/admin/guard";
import { listTiers } from "@/server/admin/tiers";
import { overview } from "@/server/admin/users";
import { hasRole } from "@/server/auth/viewer";

const format = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Column background="surface" border radius="l" padding="20" gap="4">
      <Text variant="label-default-s" onBackground="neutral-weak">
        {label}
      </Text>
      <Text variant="display-strong-xs">{value}</Text>
    </Column>
  );
}

export default async function AdminOverview() {
  const viewer = await requirePageRole("editor");
  const [stats, tierList, log] = await Promise.all([overview(), listTiers(), recentAudit(10)]);

  return (
    <Column fillWidth gap="32">
      <PageHeader title="Overview" />
      <Grid columns="4" gap="16" s={{ columns: 2 }}>
        <Stat label="Published" value={stats.works.published ?? 0} />
        <Stat label="Scheduled" value={stats.works.scheduled ?? 0} />
        <Stat label="Drafts" value={stats.works.draft ?? 0} />
        <Stat label="Users" value={stats.users} />
      </Grid>

      <Column gap="12">
        <Heading as="h2" variant="heading-strong-m">
          Supporters by tier
        </Heading>
        <Row gap="8" wrap>
          {tierList.length === 0 && (
            <Text variant="body-default-s" onBackground="neutral-weak">
              No tiers yet.
            </Text>
          )}
          {tierList.map((tier) => (
            <Tag key={tier.id} size="l">
              {pickLocalized(tier.name, "en")}: {stats.entitlementsByTier.get(tier.id) ?? 0}
            </Tag>
          ))}
        </Row>
      </Column>

      {hasRole(viewer, "admin") && (
        <Column gap="12">
          <Heading as="h2" variant="heading-strong-m">
            Recent activity
          </Heading>
          <Table
            compact
            data={{
              headers: [
                { content: "When", key: "when" },
                { content: "Who", key: "who" },
                { content: "Action", key: "action" },
              ],
              rows: log.map((entry) => [
                format.format(entry.createdAt),
                entry.actor ?? "—",
                `${entry.action} ${entry.entity}`,
              ]),
            }}
            emptyState={
              <Text variant="body-default-s" onBackground="neutral-weak">
                Nothing yet.
              </Text>
            }
          />
        </Column>
      )}
    </Column>
  );
}
