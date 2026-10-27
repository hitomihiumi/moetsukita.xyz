import {
  Avatar,
  BlobFx,
  Button,
  Column,
  Heading,
  Line,
  Media,
  RevealFx,
  Schema,
  Text,
} from "@once-ui-system/core";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { baseURL, localizedPath, person } from "@/resources/seo";
import { socials } from "@/resources/socials";

export default async function Home({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const meta = await getTranslations("Meta");
  const gallery = await getTranslations("Gallery");

  return (
    <Column fill padding="l" gap="24" center>
      <Schema
        as="webPage"
        baseURL={baseURL}
        title={meta("title")}
        description={meta("description")}
        path={localizedPath(locale)}
        sameAs={socials.map((social) => social.url)}
      />
      <RevealFx translateY="8" speed="fast" horizontal="center">
        <Column
          maxWidth="xs"
          horizontal="center"
          gap="l"
          align="center"
          border
          background="overlay"
          radius="xl"
          overflow="hidden"
        >
          <Column gap="80" fillWidth>
            <Column horizontal="center">
              <Media src={person.cover} alt="" priority sizes="480px" />
              <Avatar
                size="xl"
                src={person.avatar}
                position="absolute"
                translateY="50%"
                bottom="0"
              />
            </Column>
            <Column gap="16" paddingTop="12" paddingBottom="24" fillWidth horizontal="center">
              <Column>
                <Heading variant="heading-strong-xl">{person.name}</Heading>
                <Text onBackground="neutral-weak" variant="body-default-m">
                  {t("subtitle")}
                </Text>
              </Column>
              <Line />
              <Column horizontal="center" gap="8" maxWidth={16}>
                <Button
                  href={localizedPath(locale, "/gallery")}
                  prefixIcon="grid"
                  variant="secondary"
                  fillWidth
                >
                  {gallery("open")}
                </Button>
                {socials.map((social) => (
                  <Button
                    key={social.url}
                    prefixIcon={social.icon}
                    href={social.url}
                    target="_blank"
                    fillWidth
                  >
                    {social.name}
                  </Button>
                ))}
              </Column>
              <BlobFx
                position="absolute"
                top="0"
                left="0"
                fill
                pointerEvents="none"
                seed={40}
                translateY="50%"
                zIndex="-1"
              />
            </Column>
          </Column>
        </Column>
      </RevealFx>
    </Column>
  );
}
