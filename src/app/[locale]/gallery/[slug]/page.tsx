import {
  Button,
  Column,
  Heading,
  Icon,
  Media,
  Row,
  SmartLink,
  Tag,
  Text,
} from "@once-ui-system/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { AgeConfirmButton, BlurredImage } from "@/components/gallery";
import { formatBytes } from "@/lib/files";
import { pickLocalized } from "@/lib/localized";
import { localizedPath } from "@/resources/seo";
import { fanboxUrl, patreonUrl } from "@/resources/socials";
import { getAudience } from "@/server/gallery/audience";
import { getPublicWork } from "@/server/gallery/works";
import { previewUrl, publicUrl } from "@/server/storage";

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const { audience } = await getAudience();
  const result = await getPublicWork(slug, audience);
  if (!result || result.ageGate) return { robots: { index: false } };
  return {
    title: pickLocalized(result.work.title, locale),
    description: pickLocalized(result.work.description, locale).slice(0, 160) || undefined,
    robots: result.work.rating === "nsfw" ? { index: false, follow: false } : undefined,
  };
}

export default async function WorkPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [{ viewer, audience }, t, format] = await Promise.all([
    getAudience(),
    getTranslations("Gallery"),
    getFormatter(),
  ]);
  const result = await getPublicWork(slug, audience);
  if (!result) notFound();
  const galleryPath = localizedPath(locale, "/gallery");

  const back = (
    <Row>
      <Button href={galleryPath} variant="tertiary" size="s" prefixIcon="chevronLeft">
        {t("back")}
      </Button>
    </Row>
  );

  if (result.ageGate) {
    return (
      <Column fillWidth paddingX="16" paddingY="32" horizontal="center">
        <Column maxWidth="s" gap="24">
          {back}
          <Column
            background="surface"
            border
            radius="l"
            padding="32"
            gap="16"
            horizontal="center"
            align="center"
          >
            <Icon name="eyeOff" size="l" onBackground="neutral-weak" />
            <Heading as="h1" variant="heading-strong-l">
              {t("ageTitle")}
            </Heading>
            <Text variant="body-default-m" onBackground="neutral-weak">
              {t("ageDescription")}
            </Text>
            <AgeConfirmButton label={t("confirmAge")} />
          </Column>
        </Column>
      </Column>
    );
  }

  const { work, tier, locked, files, tags } = result;
  const title = pickLocalized(work.title, locale);
  const description = pickLocalized(work.description, locale);
  const tierName = tier ? pickLocalized(tier.name, locale) : null;
  const images = files.filter((file) => file.kind === "image");
  const others = files.filter((file) => file.kind !== "image");

  // Previews are signed only for files the visitor may open; everything else gets the public blur.
  const shown = await Promise.all(
    (locked ? images.slice(0, 1) : images).map(async (file) => ({
      id: file.id,
      locked: file.locked,
      width: file.width,
      height: file.height,
      tier: file.tier ? pickLocalized(file.tier.name, locale) : null,
      url: file.locked
        ? file.blurKey
          ? publicUrl(file.blurKey)
          : null
        : await previewUrl(file.previewKey),
    })),
  );

  return (
    <Column fillWidth paddingX="16" paddingY="32" horizontal="center">
      <Column maxWidth="m" gap="32">
        {back}
        <Column gap="12">
          <Heading as="h1" variant="display-strong-s">
            {title}
          </Heading>
          <Row gap="8" wrap vertical="center">
            {tierName && (
              <Tag scheme={locked ? "warning" : "brand"} prefixIcon={locked ? "lock" : "star"}>
                {t("locked", { tier: tierName })}
              </Tag>
            )}
            {work.rating === "nsfw" && <Tag scheme="danger">NSFW</Tag>}
            {work.publishedAt && (
              <Text variant="body-default-s" onBackground="neutral-weak">
                {t("publishedOn", {
                  date: format.dateTime(work.publishedAt, { dateStyle: "long" }),
                })}
              </Text>
            )}
          </Row>
          {description && (
            <Text
              variant="body-default-m"
              onBackground="neutral-medium"
              style={{ whiteSpace: "pre-line" }}
            >
              {description}
            </Text>
          )}
          {tags.length > 0 && (
            <Row gap="8" wrap>
              {tags.map((tag) => (
                <SmartLink
                  key={tag.slug}
                  href={`${galleryPath}?tags=${encodeURIComponent(tag.slug)}`}
                >
                  #{pickLocalized(tag.name, locale) || tag.slug}
                </SmartLink>
              ))}
            </Row>
          )}
        </Column>

        {locked && (
          <Column background="surface" border radius="l" padding="24" gap="16">
            <Heading as="h2" variant="heading-strong-m">
              {t("lockedTitle", { tier: tierName ?? "" })}
            </Heading>
            <Text variant="body-default-s" onBackground="neutral-weak">
              {t("lockedDescription")}
            </Text>
            <Row gap="8" wrap>
              {viewer ? (
                <Button href={localizedPath(locale, "/account")} prefixIcon="refresh">
                  {t("checkAccess")}
                </Button>
              ) : (
                <Button
                  href={`${localizedPath(locale, "/login")}?callbackUrl=${encodeURIComponent(localizedPath(locale, `/gallery/${work.slug}`))}`}
                  prefixIcon="person"
                >
                  {t("signIn")}
                </Button>
              )}
              <Button href={fanboxUrl} variant="secondary" prefixIcon="pixiv">
                {t("supportFanbox")}
              </Button>
              <Button href={patreonUrl} variant="secondary" prefixIcon="patreon">
                {t("supportPatreon")}
              </Button>
            </Row>
          </Column>
        )}

        <Column gap="16">
          {shown.map((image) => {
            const aspectRatio =
              image.width && image.height ? `${image.width} / ${image.height}` : "4 / 5";
            return image.locked ? (
              <Column key={image.id} radius="l" overflow="hidden" border gap="0">
                <BlurredImage src={image.url} aspectRatio={aspectRatio} />
                {!locked && image.tier && (
                  <Row padding="12">
                    <Tag size="s" scheme="warning" prefixIcon="lock">
                      {t("fileLocked", { tier: image.tier })}
                    </Tag>
                  </Row>
                )}
              </Column>
            ) : (
              image.url && (
                <Media
                  key={image.id}
                  src={image.url}
                  alt={title}
                  unoptimized
                  enlarge
                  radius="l"
                  aspectRatio={aspectRatio}
                  objectFit="contain"
                />
              )
            );
          })}
        </Column>

        {others.length > 0 && !locked && (
          <Column gap="12">
            <Heading as="h2" variant="heading-strong-m">
              {t("files")}
            </Heading>
            {others.map((file) => (
              <Row
                key={file.id}
                background="surface"
                border
                radius="m"
                padding="16"
                gap="12"
                vertical="center"
                horizontal="between"
              >
                <Row gap="12" vertical="center" minWidth={0}>
                  <Icon
                    name={file.kind === "archive" ? "folder" : "file"}
                    onBackground="neutral-weak"
                  />
                  <Column gap="2" minWidth={0}>
                    <Text variant="label-default-s" truncate>
                      {file.filename}
                    </Text>
                    <Text variant="body-default-xs" onBackground="neutral-weak">
                      {formatBytes(file.size)}
                    </Text>
                  </Column>
                </Row>
                {file.locked && file.tier && (
                  <Tag size="s" scheme="warning" prefixIcon="lock">
                    {t("fileLocked", { tier: pickLocalized(file.tier.name, locale) })}
                  </Tag>
                )}
              </Row>
            ))}
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {t("downloadsSoon")}
            </Text>
          </Column>
        )}
      </Column>
    </Column>
  );
}
