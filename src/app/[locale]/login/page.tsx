import { Button, Column, Feedback, Heading, Line, Text } from "@once-ui-system/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { safeCallbackPath } from "@/lib/paths";
import { localizedPath } from "@/resources/seo";
import { availableProviders } from "@/server/auth";
import { signInWith } from "@/server/auth/actions";
import { getViewer } from "@/server/auth/viewer";

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

const providerLabels = { discord: "Discord", patreon: "Patreon" } as const;
const knownErrors = ["AccessDenied", "OAuthAccountNotLinked", "Configuration"] as const;

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Login" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { callbackUrl, error } = await searchParams;
  const target = safeCallbackPath(callbackUrl, localizedPath(locale, "/account"));

  if (await getViewer()) redirect(target);

  const t = await getTranslations("Login");
  const providers = availableProviders();
  const errorKey = error ? (knownErrors.find((known) => known === error) ?? "default") : null;

  return (
    <Column fill padding="l" center>
      <Column
        maxWidth={28}
        background="surface"
        border
        radius="xl"
        padding="32"
        gap="24"
        horizontal="center"
      >
        <Column gap="8" horizontal="center" align="center">
          <Heading as="h1" variant="display-strong-xs">
            {t("title")}
          </Heading>
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t("description")}
          </Text>
        </Column>

        {errorKey && <Feedback variant="danger" description={t(`errors.${errorKey}`)} />}

        {providers.length === 0 ? (
          <Feedback variant="warning" description={t("notConfigured")} />
        ) : (
          <Column fillWidth gap="12">
            {providers.map((provider) => (
              <form key={provider} action={signInWith}>
                <input type="hidden" name="provider" value={provider} />
                <input type="hidden" name="callbackUrl" value={target} />
                <Button
                  type="submit"
                  fillWidth
                  prefixIcon={provider}
                  variant={provider === "discord" ? "primary" : "secondary"}
                >
                  {t("continueWith", { provider: providerLabels[provider] })}
                </Button>
              </form>
            ))}
          </Column>
        )}

        <Line />

        <Column gap="4" fillWidth>
          <Text variant="label-strong-s">{t("fanboxTitle")}</Text>
          <Text variant="body-default-s" onBackground="neutral-weak">
            {t("fanboxHint")}
          </Text>
        </Column>
      </Column>
    </Column>
  );
}
