import { Column, Row, Table, Tag, Text } from "@once-ui-system/core";
import type { Metadata } from "next";
import { PageHeader } from "@/components/admin";
import { dateTime } from "@/components/admin/labels";
import { pickLocalized } from "@/lib/localized";
import { listDownloads } from "@/server/admin/downloads";
import { requirePageRole } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Downloads" };

/** Downloads in the last 24 h above which a user is flagged. */
const HEAVY = 50;

export default async function DownloadsPage() {
  await requirePageRole("admin");
  const { rows, perUserToday } = await listDownloads();
  return (
    <Column fillWidth gap="24">
      <PageHeader
        title="Downloads"
        description={`The last ${rows.length} downloads. Users with more than ${HEAVY} in 24 hours are flagged.`}
      />
      <Table
        searchable
        searchPlaceholder="Search by user or file"
        paginated
        defaultPageSize={50}
        compact
        data={{
          headers: [
            { content: "When", key: "when" },
            { content: "User", key: "user", sortable: true },
            { content: "File", key: "file", sortable: true },
            { content: "Watermark", key: "watermark" },
            { content: "IP hash", key: "ip" },
          ],
          rows: rows.map((row) => {
            const today = row.userId ? (perUserToday.get(row.userId) ?? 0) : 0;
            return [
              dateTime.format(row.createdAt),
              <Row key="user" gap="8" vertical="center">
                <Text variant="label-default-s">{row.userName ?? "deleted user"}</Text>
                {today > HEAVY && (
                  <Tag size="s" scheme="danger">
                    {today} today
                  </Tag>
                )}
              </Row>,
              <Column key="file" gap="2">
                <Text variant="label-default-s">{row.filename ?? "deleted file"}</Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {row.workTitle ? pickLocalized(row.workTitle, "en") : ""}
                </Text>
              </Column>,
              <Text key="watermark" variant="code-default-xs" onBackground="neutral-weak">
                {row.watermark !== null
                  ? row.watermark.toString(16)
                  : row.reused
                    ? "reused copy"
                    : "—"}
              </Text>,
              <Text key="ip" variant="code-default-xs" onBackground="neutral-weak">
                {row.ipHash?.slice(0, 10) ?? "—"}
              </Text>,
            ];
          }),
        }}
        emptyState={
          <Text variant="body-default-s" onBackground="neutral-weak">
            No downloads yet.
          </Text>
        }
      />
    </Column>
  );
}
