"use client";

import {
  Button,
  Column,
  DateInput,
  Grid,
  Heading,
  Input,
  Row,
  SegmentedControl,
  Select,
  Text,
  Textarea,
  useToast,
} from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteWorkAction, saveWorkAction } from "@/app/admin/actions";
import { slugify } from "@/lib/slug";
import { ConfirmDialog } from "./ConfirmDialog";
import { PageHeader } from "./PageHeader";

type Lang = "en" | "ru" | "ja";
const languages: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
];

type WorkFormProps = {
  work: {
    id: string;
    slug: string;
    title: Partial<Record<Lang, string>>;
    description: Partial<Record<Lang, string>>;
    rating: "sfw" | "nsfw";
    minTierId: string | null;
    status: "draft" | "scheduled" | "published";
    publishedAt: string | null;
    tagIds: string[];
  };
  tiers: { id: string; label: string }[];
  tags: { id: string; label: string }[];
};

const PUBLIC = "public";

export function WorkForm({ work, tiers, tags }: WorkFormProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState(work.title);
  const [description, setDescription] = useState(work.description);
  const [slug, setSlug] = useState(work.slug);
  // A fresh draft follows its English title until the slug is edited by hand.
  const [slugTouched, setSlugTouched] = useState(!work.slug.startsWith("untitled-"));
  const [rating, setRating] = useState(work.rating);
  const [minTierId, setMinTierId] = useState(work.minTierId);
  const [status, setStatus] = useState(work.status);
  const [publishedAt, setPublishedAt] = useState(
    work.publishedAt ? new Date(work.publishedAt) : null,
  );
  const [tagIds, setTagIds] = useState(work.tagIds);

  const save = () =>
    startTransition(async () => {
      const result = await saveWorkAction(work.id, {
        slug,
        title,
        description,
        rating,
        minTierId,
        status,
        publishedAt,
        tagIds,
      });
      if (result.ok) {
        setErrors({});
        addToast({ variant: "success", message: "Saved" });
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        addToast({ variant: "danger", message: result.error });
      }
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteWorkAction(work.id);
      if (result.ok) router.push("/admin/works");
      else addToast({ variant: "danger", message: result.error });
    });

  return (
    <Column fillWidth gap="32">
      <PageHeader
        title={title.en || title.ru || title.ja || "Untitled"}
        description={`/${slug}`}
        action={
          <Row gap="8">
            <Button variant="tertiary" prefixIcon="trash" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            <Button prefixIcon="check" loading={pending} onClick={save}>
              Save
            </Button>
          </Row>
        }
      />

      <Column background="surface" border radius="l" padding="24" gap="20">
        <Heading as="h2" variant="heading-strong-m">
          Text
        </Heading>
        {errors.title && (
          <Text variant="body-default-s" onBackground="danger-weak">
            {errors.title}
          </Text>
        )}
        <Grid columns="3" gap="16" s={{ columns: 1 }}>
          {languages.map((language) => (
            <Column key={language.code} gap="12">
              <Input
                id={`title-${language.code}`}
                label={`Title · ${language.label}`}
                value={title[language.code] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setTitle((current) => ({ ...current, [language.code]: value }));
                  if (language.code === "en" && !slugTouched) setSlug(slugify(value, slug));
                }}
              />
              <Textarea
                id={`description-${language.code}`}
                label={`Description · ${language.label}`}
                lines={5}
                value={description[language.code] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setDescription((current) => ({ ...current, [language.code]: value }));
                }}
              />
            </Column>
          ))}
        </Grid>
      </Column>

      <Column background="surface" border radius="l" padding="24" gap="20">
        <Heading as="h2" variant="heading-strong-m">
          Publishing
        </Heading>
        <Grid columns="2" gap="16" s={{ columns: 1 }}>
          <Input
            id="slug"
            label="Slug"
            value={slug}
            error={Boolean(errors.slug)}
            errorMessage={errors.slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
          <Select
            id="tier"
            label="Who can open it"
            value={minTierId ?? PUBLIC}
            onSelect={(value) => setMinTierId(value === PUBLIC ? null : (value as string))}
            options={[
              { value: PUBLIC, label: "Everyone" },
              ...tiers.map((tier) => ({ value: tier.id, label: tier.label })),
            ]}
          />
          <Select
            id="status"
            label="Status"
            value={status}
            onSelect={(value) => setStatus(value as typeof status)}
            options={[
              { value: "draft", label: "Draft — hidden" },
              { value: "scheduled", label: "Scheduled — appears at the date" },
              { value: "published", label: "Published" },
            ]}
          />
          {status !== "draft" ? (
            <DateInput
              id="publishedAt"
              label={status === "scheduled" ? "Publish at" : "Published at (empty = now)"}
              timePicker
              value={publishedAt ?? undefined}
              onChange={setPublishedAt}
            />
          ) : (
            <Row />
          )}
        </Grid>
        {errors.publishedAt && (
          <Text variant="body-default-s" onBackground="danger-weak">
            {errors.publishedAt}
          </Text>
        )}
        <Column gap="8">
          <Text variant="label-default-s" onBackground="neutral-weak">
            Rating
          </Text>
          <SegmentedControl
            fillWidth={false}
            value={rating}
            onChange={(value) => setRating(value as typeof rating)}
            buttons={[
              { value: "sfw", label: "SFW" },
              { value: "nsfw", label: "NSFW" },
            ]}
          />
        </Column>
        <Select
          id="tags"
          label="Tags"
          multiple
          searchable
          value={tagIds}
          onSelect={(value) => setTagIds(value as string[])}
          options={tags.map((tag) => ({ value: tag.id, label: tag.label }))}
          emptyState="No tags. Create them under Tags."
        />
      </Column>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete work?"
        description="The work and all its files will be deleted. This cannot be undone."
        pending={pending}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </Column>
  );
}
