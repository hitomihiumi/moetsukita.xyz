import { Button, Column, Heading, Icon, Row, Tag, Text, User } from "@once-ui-system/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Locale } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { RefreshAccessButton } from "@/components/RefreshAccessButton";
import { pickLocalized } from "@/lib/localized";
import { localizedPath } from "@/resources/seo";
import { availableProviders } from "@/server/auth";
import { disconnect, signInWith, signOutAction } from "@/server/auth/actions";
import { getViewer } from "@/server/auth/viewer";

type Props = { params: Promise<{ locale: Locale }> };

const providerLabels = { discord: "Discord", patreon: "Patreon" } as const;
const sourceOf = { discord: "discord", patreon: "patreon" } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Account" });
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const accountPath = localizedPath(locale, "/account");

  const viewer = await getViewer();
  if (!viewer)
    redirect(`${localizedPath(locale, "/login")}?callbackUrl=${encodeURIComponent(accountPath)}`);

  const [t, format] = await Promise.all([getTranslations("Account"), getFormatter()]);
  const providers = availableProviders();

  return (
    <Column fillWidth paddingX="16" paddingY="40" horizontal="center">
      <Column maxWidth="s" gap="24">
        <Row horizontal="between" vertical="center" gap="16" wrap>
          <User
            name={viewer.name ?? t("title")}
            subline={t(`role.${viewer.role}`)}
            avatarProps={{
              src: viewer.image ?? undefined,
              value: viewer.image ? undefined : (viewer.name ?? "?").slice(0, 1),
              size: "l",
            }}
          />
          <form action={signOutAction}>
            <input type="hidden" name="callbackUrl" value={localizedPath(locale)} />
            <Button type="submit" variant="tertiary" size="s" prefixIcon="logout">
              {t("signOut")}
            </Button>
          </form>
        </Row>

        <Column background="surface" border radius="l" padding="24" gap="20">
          <Row horizontal="between" vertical="start" gap="16" wrap>
            <Column gap="4" flex={1} minWidth={16}>
              <Heading as="h2" variant="heading-strong-m">
                {t("access")}
              </Heading>
              <Text variant="body-default-s" onBackground="neutral-weak">
                {t("accessDescription")}
              </Text>
            </Column>
            <RefreshAccessButton />
          </Row>

          <Row
            background="neutral-alpha-weak"
            radius="m"
            padding="16"
            horizontal="between"
            vertical="center"
            gap="16"
          >
            <Text variant="label-default-m" onBackground="neutral-weak">
              {t("currentTier")}
            </Text>
            {viewer.tier ? (
              <Tag scheme="brand" size="l" prefixIcon="star">
                {pickLocalized(viewer.tier.name, locale)}
              </Tag>
            ) : (
              <Tag size="l">{t("free")}</Tag>
            )}
          </Row>

          {viewer.sources.length > 0 && (
            <Column gap="8">
              {viewer.sources.map((entry) => (
                <Row key={entry.source} horizontal="between" vertical="center" gap="16">
                  <Text variant="body-default-s">{t(`sources.${entry.source}`)}</Text>
                  <Text variant="body-default-s" onBackground="neutral-weak">
                    {pickLocalized(entry.tier.name, locale)}
                    {entry.expiresAt &&
                      ` · ${t("until", { date: format.dateTime(entry.expiresAt, { dateStyle: "medium" }) })}`}
                  </Text>
                </Row>
              ))}
            </Column>
          )}

          <Text variant="body-default-xs" onBackground="neutral-weak">
            {viewer.accessSyncedAt
              ? t("lastChecked", { time: format.relativeTime(viewer.accessSyncedAt) })
              : t("neverChecked")}
          </Text>
        </Column>

        <Column background="surface" border radius="l" padding="24" gap="20">
          <Column gap="4">
            <Heading as="h2" variant="heading-strong-m">
              {t("connections")}
            </Heading>
            <Text variant="body-default-s" onBackground="neutral-weak">
              {t("connectionsDescription")}
            </Text>
          </Column>

          {providers.map((provider) => {
            const connected = viewer.providers.includes(provider);
            const tier = viewer.sources.find((entry) => entry.source === sourceOf[provider])?.tier;
            const onlyMethod = connected && viewer.providers.length < 2;
            return (
              <Column key={provider} gap="8" paddingTop="16" borderTop>
                <Row horizontal="between" vertical="center" gap="16">
                  <Row gap="12" vertical="center">
                    <Icon name={provider} size="m" onBackground="neutral-strong" />
                    <Column gap="2">
                      <Text variant="label-strong-m">{providerLabels[provider]}</Text>
                      <Text variant="body-default-xs" onBackground="neutral-weak">
                        {connected
                          ? `${t("connected")} · ${tier ? pickLocalized(tier.name, locale) : t("noTier")}`
                          : t("notConnected")}
                      </Text>
                    </Column>
                  </Row>
                  {connected ? (
                    <form action={disconnect}>
                      <input type="hidden" name="provider" value={provider} />
                      <Button
                        type="submit"
                        variant="tertiary"
                        size="s"
                        disabled={onlyMethod}
                        aria-describedby={onlyMethod ? `${provider}-only` : undefined}
                      >
                        {t("disconnect")}
                      </Button>
                    </form>
                  ) : (
                    <form action={signInWith}>
                      <input type="hidden" name="provider" value={provider} />
                      <input type="hidden" name="callbackUrl" value={accountPath} />
                      <Button type="submit" variant="secondary" size="s" prefixIcon="link">
                        {t("connect")}
                      </Button>
                    </form>
                  )}
                </Row>
                <Text
                  id={onlyMethod ? `${provider}-only` : undefined}
                  variant="body-default-xs"
                  onBackground="neutral-weak"
                >
                  {onlyMethod
                    ? t("disconnectLast")
                    : t(provider === "discord" ? "discordHint" : "patreonHint")}
                </Text>
              </Column>
            );
          })}
        </Column>
      </Column>
    </Column>
  );
}
