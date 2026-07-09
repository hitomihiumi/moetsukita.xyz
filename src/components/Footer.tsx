import { Fade, Flex, IconButton, SmartLink, Text } from "@once-ui-system/core";
import styles from "./Footer.module.scss";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <Flex
        as="footer"
        fillWidth
        padding="8"
        horizontal="center"
        s={{ direction: "column" }}
        zIndex={8}
      >
        <Flex
          className={styles.mobile}
          maxWidth="m"
          paddingY="8"
          paddingX="16"
          gap="16"
          horizontal="between"
          vertical="center"
        >
          <Text variant="body-default-s" onBackground="neutral-strong">
            <Text onBackground="neutral-weak">© {currentYear} /</Text>
            <Text onBackground="neutral-weak">
              {" "}
              Built with <SmartLink href="https://once-ui.com">Once UI</SmartLink> / By{" "}
              <SmartLink href="https://hitomihiumi.xyz">hitomihiumi</SmartLink> 💜
            </Text>
          </Text>
          <Flex gap="16">
            <IconButton
              icon="github"
              variant="ghost"
              target="_blank"
              href="https://github.com/hitomihiumi/moetsukita.xyz"
            />
          </Flex>
        </Flex>
      </Flex>
    </>
  );
};
