"use client";

import {
  Button,
  Column,
  Media,
  Row,
  SegmentedControl,
  Table,
  Tag,
  Text,
  useToast,
} from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWorkAction, deleteWorkAction } from "@/app/admin/actions";
import { ConfirmDialog } from "./ConfirmDialog";
import { dateTime, ratingTag, statusTag } from "./labels";
import { PageHeader } from "./PageHeader";

type WorkRow = {
  id: string;
  slug: string;
  title: string;
  rating: "sfw" | "nsfw";
  status: "draft" | "scheduled" | "published";
  tier: string | null;
  assetCount: number;
  updatedAt: string;
  thumb: string | null;
};

type Filter = "all" | WorkRow["status"];

export function WorksTable({ works }: { works: WorkRow[] }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<WorkRow | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = works.filter((work) => filter === "all" || work.status === filter);

  const create = () =>
    startTransition(async () => {
      const result = await createWorkAction();
      if (result && !result.ok) addToast({ variant: "danger", message: result.error });
    });

  const remove = () =>
    startTransition(async () => {
      if (!deleting) return;
      const result = await deleteWorkAction(deleting.id);
      if (!result.ok) addToast({ variant: "danger", message: result.error });
      else addToast({ variant: "success", message: `Deleted ${deleting.title}` });
      setDeleting(null);
    });

  return (
    <Column fillWidth gap="24">
      <PageHeader
        title="Works"
        description="Everything in the gallery, drafts included."
        action={
          <Button prefixIcon="plus" onClick={create} loading={pending && !deleting}>
            New work
          </Button>
        }
      />

      <SegmentedControl
        fillWidth={false}
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        buttons={[
          { value: "all", label: "All" },
          { value: "published", label: "Published" },
          { value: "scheduled", label: "Scheduled" },
          { value: "draft", label: "Drafts" },
        ]}
      />

      <Table
        searchable
        searchPlaceholder="Search works"
        paginated
        defaultPageSize={20}
        onRowClick={(row) => router.push(`/admin/works/${visible[row].id}`)}
        data={{
          headers: [
            { content: "Work", key: "work", sortable: true },
            { content: "Status", key: "status", sortable: true },
            { content: "Rating", key: "rating", sortable: true },
            { content: "Tier", key: "tier", sortable: true },
            { content: "Files", key: "files", sortable: true, align: "right" },
            { content: "Updated", key: "updated", sortable: true, align: "right" },
          ],
          rows: visible.map((work) => [
            <Row key="work" gap="12" vertical="center">
              <Row
                width="40"
                height="40"
                radius="s"
                overflow="hidden"
                background="neutral-alpha-weak"
              >
                {work.thumb && (
                  <Media src={work.thumb} alt="" aspectRatio="1 / 1" unoptimized radius="s" />
                )}
              </Row>
              <Column gap="2">
                <Text variant="label-default-s">{work.title}</Text>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  {work.slug}
                </Text>
              </Column>
            </Row>,
            <Tag key="status" size="s" scheme={statusTag[work.status].scheme}>
              {statusTag[work.status].label}
            </Tag>,
            <Tag key="rating" size="s" scheme={ratingTag[work.rating].scheme}>
              {ratingTag[work.rating].label}
            </Tag>,
            work.tier ?? "Public",
            String(work.assetCount),
            dateTime.format(new Date(work.updatedAt)),
          ]),
        }}
        actions={[
          {
            icon: "edit",
            tooltip: "Edit",
            onClick: (row) => router.push(`/admin/works/${visible[row].id}`),
          },
          {
            icon: "trash",
            tooltip: "Delete",
            variant: "danger",
            onClick: (row) => setDeleting(visible[row]),
          },
        ]}
        emptyState={
          <Column center gap="12" padding="32">
            <Text variant="body-default-s" onBackground="neutral-weak">
              {works.length === 0 ? "No works yet." : "No works match this filter."}
            </Text>
            {works.length > 0 && (
              <Button size="s" variant="secondary" onClick={() => setFilter("all")}>
                Show all
              </Button>
            )}
          </Column>
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete work?"
        description={`“${deleting?.title}” and all its files will be deleted. This cannot be undone.`}
        pending={pending}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </Column>
  );
}
