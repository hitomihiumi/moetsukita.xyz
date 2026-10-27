"use client";

import {
  Column,
  IconButton,
  Input,
  Row,
  SegmentedControl,
  Select,
  Switch,
} from "@once-ui-system/core";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { type GalleryQuery, galleryQueryString } from "@/lib/search";

type TagOption = { slug: string; label: string };

export function GalleryFilters({
  query,
  tags,
  adult,
  signedIn,
}: {
  query: GalleryQuery;
  tags: TagOption[];
  adult: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations("Gallery");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query.text);

  // Any change starts again from the first page.
  const apply = (patch: Partial<GalleryQuery>) =>
    startTransition(() =>
      router.replace(`${pathname}${galleryQueryString({ ...query, ...patch, page: 1 })}`, {
        scroll: false,
      }),
    );

  return (
    <Column fillWidth gap="12">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ text: text.trim() });
        }}
      >
        <Input
          id="gallery-search"
          label={t("searchPlaceholder")}
          value={text}
          onChange={(event) => setText(event.target.value)}
          prefix={null}
          suffix={
            <IconButton
              type="submit"
              icon="search"
              variant="ghost"
              size="s"
              tooltip={t("search")}
              loading={pending}
            />
          }
        />
      </form>
      <Row gap="12" vertical="center" wrap s={{ direction: "column", horizontal: "stretch" }}>
        <Row flex={1} minWidth={16}>
          <Select
            id="gallery-tags"
            label={t("tags")}
            multiple
            searchable
            size="s"
            value={query.tags}
            emptyState={t("noTags")}
            onSelect={(value) => apply({ tags: value as string[] })}
            options={tags.map((tag) => ({ value: tag.slug, label: tag.label }))}
          />
        </Row>
        {adult && (
          <SegmentedControl
            fillWidth={false}
            value={query.rating}
            onChange={(rating) => apply({ rating: rating as GalleryQuery["rating"] })}
            buttons={(["all", "sfw", "nsfw"] as const).map((value) => ({
              value,
              label: t(`rating.${value}`),
            }))}
          />
        )}
        <SegmentedControl
          fillWidth={false}
          value={query.sort}
          onChange={(sort) => apply({ sort: sort as GalleryQuery["sort"] })}
          buttons={(["new", "old"] as const).map((value) => ({ value, label: t(`sort.${value}`) }))}
        />
        {signedIn && (
          <Switch label={t("mine")} checked={query.mine} onToggle={(mine) => apply({ mine })} />
        )}
      </Row>
    </Column>
  );
}
