import { Flex, IconButton, Row, SmartLink, Text } from "@once-ui-system/core";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";

export async function Footer() {
  const t = await getTranslations("Footer");
  const currentYear = new Date().getFullYear();

  return (
    <Row as="footer" fillWidth padding="8" horizontal="center">
      <Flex
        maxWidth="m"
        paddingY="8"
        paddingX="16"
        gap="16"
        horizontal="between"
        vertical="center"
        s={{ direction: "column", align: "center" }}
      >
        <Text variant="body-default-s" onBackground="neutral-weak">
          © {currentYear} / {t("builtWith")}{" "}
          <SmartLink href="https://once-ui.com">Once UI</SmartLink> / {t("by")}{" "}
          <SmartLink href="https://hitomihiumi.xyz">hitomihiumi</SmartLink> 💜
        </Text>
        <Row gap="8" vertical="center">
          <LocaleSwitcher />
          <ThemeToggle />
          <IconButton
            icon="github"
            variant="ghost"
            size="s"
            tooltip={t("source")}
            href="https://github.com/hitomihiumi/moetsukita.xyz"
          />
        </Row>
      </Flex>
    </Row>
  );
}
