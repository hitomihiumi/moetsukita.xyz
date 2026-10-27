import { Column, Table, Text } from "@once-ui-system/core";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin";
import { dateTime } from "@/components/admin/labels";
import { recentAudit } from "@/server/admin/audit";
import { requirePageRole } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requirePageRole("admin");
  const entries = await recentAudit(500);
  return (
    <Column fillWidth gap="24">
      <PageHeader title="Audit log" description="The last 500 changes made in the admin panel." />
      <Table
        searchable
        paginated
        defaultPageSize={50}
        compact
        data={{
          headers: [
            { content: "When", key: "when" },
            { content: "Who", key: "who", sortable: true },
            { content: "Action", key: "action", sortable: true },
            { content: "Target", key: "target" },
            { content: "Details", key: "details" },
          ],
          rows: entries.map((entry) => [
            dateTime.format(entry.createdAt),
            entry.actor ?? "—",
            `${entry.action} ${entry.entity}`,
            <Text key="target" variant="code-default-xs" onBackground="neutral-weak">
              {entry.entityId ?? "—"}
            </Text>,
            <Text key="details" variant="code-default-xs" onBackground="neutral-weak" truncate>
              {entry.diff ? JSON.stringify(entry.diff).slice(0, 160) : ""}
            </Text>,
          ]),
        }}
      />
    </Column>
  );
}
