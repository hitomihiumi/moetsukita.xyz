"use client";

import { Button, Column, Heading, Text } from "@once-ui-system/core";
import { useTranslations } from "next-intl";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("Error");
  return (
    <Column fill padding="l" gap="16" center align="center">
      <Heading variant="display-strong-xs">{t("title")}</Heading>
      <Text onBackground="neutral-weak" variant="body-default-m">
        {t("description")}
      </Text>
      <Button prefixIcon="refresh" onClick={reset}>
        {t("retry")}
      </Button>
    </Column>
  );
}
