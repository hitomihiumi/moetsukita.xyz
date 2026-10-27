import { Button, Column, Feedback, Heading, MasonryGrid, Row, Text } from "@once-ui-system/core";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  AgeConfirmButton,
  GalleryCard,
  GalleryFilters,
  GalleryPagination,
} from "@/components/gallery";
import { pickLocalized } from "@/lib/localized";
import { parseGalleryQuery } from "@/lib/search";
import { alternates, localizedPath } from "@/resources/seo";
import { getAudience } from "@/server/gallery/audience";
import { allTags, PAGE_SIZE, searchWorks } from "@/server/gallery/works";
import { previewUrl, publicUrl } from "@/server/storage";

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Gallery" });
  return {
    title: t("metaTitle"),
    description: t("description"),
    alternates: {
      canonical: localizedPath(locale, "/gallery"),
      languages: Object.fromEntries(alternates("/gallery").map((a) => [a.hrefLang, a.href])),
    },
  };
}

export default async function GalleryPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = parseGalleryQuery(await searchParams);
  const [{ viewer, audience }, t] = await Promise.all([getAudience(), getTranslations("Gallery")]);
  const [result, tags] = await Promise.all([searchWorks(query, audience), allTags()]);

  const cards = await Promise.all(
    result.items.map(async (item) => ({
      id: item.id,
      href: localizedPath(locale, `/gallery/${item.slug}`),
      title: pickLocalized(item.title, locale),
      // Locked works only ever get the public blur; the real preview is never signed for them.
      image: item.locked
        ? item.cover?.blurKey
          ? publicUrl(item.cover.blurKey)
          : null
        : await previewUrl(item.cover?.thumbKey ?? null),
      width: item.cover?.width ?? null,
      height: item.cover?.height ?? null,
      locked: item.locked,
      lockLabel: item.tier ? t("locked", { tier: pickLocalized(item.tier.name, locale) }) : null,
      nsfw: item.rating === "nsfw",
      imagesLabel: item.images > 1 ? t("images", { count: item.images }) : null,
    })),
  );
  const filtered =
    query.text || query.tags.length || query.exclude.length || query.mine || query.rating !== "all";

  return (
    <Column fillWidth paddingX="16" paddingY="32" horizontal="center">
      <Column maxWidth="l" gap="24">
        <Column gap="8">
          <Heading as="h1" variant="display-strong-s">
            {t("title")}
          </Heading>
          <Text variant="body-default-m" onBackground="neutral-weak">
            {t("description")}
          </Text>
        </Column>

        <GalleryFilters
          query={query}
          adult={audience.adult}
          signedIn={viewer !== null}
          tags={tags.map((tag) => ({
            slug: tag.slug,
            label: pickLocalized(tag.name, locale) || tag.slug,
          }))}
        />

        {!audience.adult && (
          <Feedback variant="info" description={t("nsfwHidden")}>
            <Row paddingTop="8">
              <AgeConfirmButton label={t("confirmAge")} size="s" />
            </Row>
          </Feedback>
        )}

        <Text variant="label-default-s" onBackground="neutral-weak">
          {t("results", { count: result.total })}
        </Text>

        {cards.length === 0 ? (
          <Column center gap="12" paddingY="64">
            <Text variant="body-default-m" onBackground="neutral-weak">
              {t("empty")}
            </Text>
            {filtered && (
              <Button variant="secondary" size="s" href={localizedPath(locale, "/gallery")}>
                {t("reset")}
              </Button>
            )}
          </Column>
        ) : (
          <MasonryGrid
            columns={4}
            gap="16"
            l={{ columns: 3 }}
            m={{ columns: 2 }}
            s={{ columns: 2 }}
          >
            {cards.map(({ id, ...card }) => (
              <GalleryCard key={id} {...card} />
            ))}
          </MasonryGrid>
        )}

        <Row horizontal="center">
          <GalleryPagination query={query} total={result.total} perPage={PAGE_SIZE} />
        </Row>
      </Column>
    </Column>
  );
}
