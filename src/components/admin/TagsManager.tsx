"use client";

import {
  Button,
  Column,
  Dialog,
  Grid,
  Input,
  Row,
  Select,
  Table,
  Tag,
  TagInput,
  Text,
  useToast,
} from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTagAction, mergeTagsAction, saveTagAction } from "@/app/admin/actions";
import { slugify } from "@/lib/slug";
import { ConfirmDialog } from "./ConfirmDialog";
import { PageHeader } from "./PageHeader";

type Lang = "en" | "ru" | "ja";
type Category = "character" | "series" | "general" | "meta";
type TagRow = {
  id: string;
  slug: string;
  name: Partial<Record<Lang, string>>;
  category: Category;
  aliases: string[];
  uses: number;
};

const categories: { value: Category; label: string }[] = [
  { value: "character", label: "Character" },
  { value: "series", label: "Series" },
  { value: "general", label: "General" },
  { value: "meta", label: "Meta" },
];
const categoryScheme = {
  character: "brand",
  series: "accent",
  general: "neutral",
  meta: "info",
} as const;

const empty: Omit<TagRow, "id" | "uses"> = { slug: "", name: {}, category: "general", aliases: [] };

export function TagsManager({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<{ id: string | null; value: typeof empty } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<TagRow | null>(null);
  const [merging, setMerging] = useState<TagRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  const label = (tag: TagRow) => tag.name.en ?? tag.name.ru ?? tag.name.ja ?? tag.slug;
  const done = (message: string) => {
    addToast({ variant: "success", message });
    router.refresh();
  };

  const save = () =>
    startTransition(async () => {
      if (!editing) return;
      const result = await saveTagAction(editing.id, editing.value);
      if (result.ok) {
        setEditing(null);
        setErrors({});
        done("Tag saved");
      } else {
        setErrors(result.fieldErrors ?? {});
        addToast({ variant: "danger", message: result.error });
      }
    });

  const set = (patch: Partial<typeof empty>) =>
    setEditing((current) => current && { ...current, value: { ...current.value, ...patch } });

  return (
    <Column fillWidth gap="24">
      <PageHeader
        title="Tags"
        description="Characters, series and anything people search by."
        action={
          <Button prefixIcon="plus" onClick={() => setEditing({ id: null, value: empty })}>
            New tag
          </Button>
        }
      />

      <Table
        searchable
        searchPlaceholder="Search tags"
        paginated
        defaultPageSize={50}
        data={{
          headers: [
            { content: "Tag", key: "tag", sortable: true },
            { content: "Category", key: "category", sortable: true },
            { content: "Aliases", key: "aliases" },
            { content: "Works", key: "uses", sortable: true, align: "right" },
          ],
          rows: tags.map((tag) => [
            <Column key="tag" gap="2">
              <Text variant="label-default-s">{label(tag)}</Text>
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {tag.slug}
              </Text>
            </Column>,
            <Tag key="category" size="s" scheme={categoryScheme[tag.category]}>
              {tag.category}
            </Tag>,
            tag.aliases.join(", "),
            String(tag.uses),
          ]),
        }}
        actions={[
          {
            icon: "edit",
            tooltip: "Edit",
            onClick: (row) => {
              const { id, uses: _uses, ...value } = tags[row];
              setEditing({ id, value });
            },
          },
          {
            icon: "chevronsLeftRight",
            tooltip: "Merge into…",
            onClick: (row) => setMerging(tags[row]),
          },
          {
            icon: "trash",
            tooltip: "Delete",
            variant: "danger",
            onClick: (row) => setDeleting(tags[row]),
          },
        ]}
        emptyState={
          <Text variant="body-default-s" onBackground="neutral-weak">
            No tags yet.
          </Text>
        }
      />

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit tag" : "New tag"}
        footer={
          <Row fillWidth horizontal="end" gap="8">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={save}>
              Save
            </Button>
          </Row>
        }
      >
        {editing && (
          <Column gap="16">
            <Grid columns="3" gap="12" s={{ columns: 1 }}>
              {(["en", "ru", "ja"] as const).map((lang) => (
                <Input
                  key={lang}
                  id={`tag-name-${lang}`}
                  label={`Name · ${lang.toUpperCase()}`}
                  value={editing.value.name[lang] ?? ""}
                  onChange={(event) => {
                    const name = { ...editing.value.name, [lang]: event.target.value };
                    set(
                      lang === "en" && !editing.id
                        ? { name, slug: slugify(event.target.value, "") }
                        : { name },
                    );
                  }}
                />
              ))}
            </Grid>
            {errors.name && (
              <Text variant="body-default-s" onBackground="danger-weak">
                {errors.name}
              </Text>
            )}
            <Input
              id="tag-slug"
              label="Slug"
              value={editing.value.slug}
              error={Boolean(errors.slug)}
              errorMessage={errors.slug}
              onChange={(event) => set({ slug: event.target.value })}
            />
            <Select
              id="tag-category"
              label="Category"
              value={editing.value.category}
              onSelect={(value) => set({ category: value as Category })}
              options={categories}
            />
            <TagInput
              id="tag-aliases"
              label="Aliases (other spellings that find it)"
              value={editing.value.aliases}
              onChange={(aliases) => set({ aliases })}
            />
          </Column>
        )}
      </Dialog>

      <Dialog
        open={merging !== null}
        onClose={() => setMerging(null)}
        title={`Merge “${merging ? label(merging) : ""}”`}
        description="Its works move to the chosen tag, its names become aliases, and it is deleted."
        footer={
          <Row fillWidth horizontal="end" gap="8">
            <Button variant="secondary" onClick={() => setMerging(null)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={!mergeTarget}
              onClick={() =>
                startTransition(async () => {
                  if (!merging || !mergeTarget) return;
                  const result = await mergeTagsAction(merging.id, mergeTarget);
                  setMerging(null);
                  setMergeTarget(null);
                  if (result.ok) done("Tags merged");
                  else addToast({ variant: "danger", message: result.error });
                })
              }
            >
              Merge
            </Button>
          </Row>
        }
      >
        <Select
          id="merge-target"
          label="Into"
          searchable
          value={mergeTarget ?? ""}
          onSelect={(value) => setMergeTarget(value as string)}
          options={tags
            .filter((tag) => tag.id !== merging?.id)
            .map((tag) => ({ value: tag.id, label: `${label(tag)} · ${tag.slug}` }))}
        />
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete tag?"
        description={`“${deleting ? label(deleting) : ""}” is removed from ${deleting?.uses ?? 0} works.`}
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            const result = await deleteTagAction(deleting.id);
            setDeleting(null);
            if (result.ok) done("Tag deleted");
            else addToast({ variant: "danger", message: result.error });
          })
        }
        onClose={() => setDeleting(null)}
      />
    </Column>
  );
}
