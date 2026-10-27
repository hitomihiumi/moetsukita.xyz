import { Button, Column, Heading, Text } from "@once-ui-system/core";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPath } from "@/resources/seo";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  const locale = await getLocale();

  return (
    <Column fill padding="l" gap="16" center align="center">
      <Text variant="display-strong-l" onBackground="neutral-weak">
        404
      </Text>
      <Heading variant="display-strong-xs">{t("title")}</Heading>
      <Text onBackground="neutral-weak" variant="body-default-m">
        {t("description")}
      </Text>
      <Button href={localizedPath(locale)} prefixIcon="home">
        {t("back")}
      </Button>
    </Column>
  );
}
