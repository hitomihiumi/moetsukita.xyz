import { Button, Row, SmartLink, Text } from "@once-ui-system/core";
import { getLocale, getTranslations } from "next-intl/server";
import { pickLocalized } from "@/lib/localized";
import { localizedPath, person } from "@/resources/seo";
import { signOutAction } from "@/server/auth/actions";
import { getViewer, hasRole } from "@/server/auth/viewer";
import { AccountMenu } from "./AccountMenu";

export async function Header() {
  const [viewer, locale, t] = await Promise.all([
    getViewer(),
    getLocale(),
    getTranslations("Header"),
  ]);

  return (
    <Row as="header" fillWidth paddingX="16" paddingY="12" horizontal="center">
      <Row maxWidth="m" horizontal="between" vertical="center" gap="16">
        <Row gap="16" vertical="center">
          <SmartLink href={localizedPath(locale)} unstyled>
            <Text variant="heading-strong-s" onBackground="neutral-strong">
              {person.name}
            </Text>
          </SmartLink>
          <Button
            href={localizedPath(locale, "/gallery")}
            variant="tertiary"
            size="s"
            prefixIcon="grid"
          >
            {t("gallery")}
          </Button>
        </Row>
        {viewer ? (
          <AccountMenu
            name={viewer.name ?? t("account")}
            image={viewer.image}
            subline={viewer.tier ? pickLocalized(viewer.tier.name, locale) : t("free")}
            accountHref={localizedPath(locale, "/account")}
            adminHref={hasRole(viewer, "editor") ? "/admin" : undefined}
            homePath={localizedPath(locale)}
            signOut={signOutAction}
          />
        ) : (
          <Button
            href={localizedPath(locale, "/login")}
            variant="secondary"
            size="s"
            prefixIcon="person"
          >
            {t("signIn")}
          </Button>
        )}
      </Row>
    </Row>
  );
}
