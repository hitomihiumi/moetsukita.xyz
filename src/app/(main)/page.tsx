import {
  Heading,
  Text,
  Button,
  Column,
  Badge,
  Logo,
  Line,
  LetterFx,
  Avatar,
  Media,
  RevealFx,
  BlobFx,
} from "@once-ui-system/core";
import { Schema } from "@once-ui-system/core";
import { baseURL, meta } from "@/resources/seo";

type Social = {
  name: string;
  url: string;
  icon: string;
};

const socials: Social[] = [
  {
    name: "Twitter (SFW)",
    url: "https://x.com/a1ttri",
    icon: "twitter",
  },
  {
    name: "Twitter (NSFW)",
    url: "https://x.com/a1ttri1",
    icon: "twitter",
  },
  {
    name: "Pixiv",
    url: "https://www.pixiv.net/en/users/79540158",
    icon: "pixiv",
  },
  {
    name: "Fanbox",
    url: "https://moetsukita.fanbox.cc/",
    icon: "pixiv",
  },
  {
    name: "Patreon",
    url: "https://www.patreon.com/c/Moetsukita",
    icon: "patreon",
  },
  {
    name: "Telegram (RU)",
    url: "https://t.me/Moetsukita",
    icon: "telegram",
  },
  {
    name: "Instagram",
    url: "https://www.instagram.com/1moetsukita/",
    icon: "instagram",
  },
];

export default function Home() {
  return (
    <Column
      fill
      paddingX="l"
      paddingY="l"
      direction="column"
      gap={"24"}
      horizontal={"center"}
      vertical={"center"}
    >
      <Schema
        as="webPage"
        baseURL={baseURL}
        title={meta.home.title}
        description={meta.home.description}
        path={meta.home.path}
      />
      <RevealFx translateY={0.5} horizontal="center">
        <Column
          maxWidth="xs"
          horizontal="center"
          gap="l"
          align="center"
          border="neutral-alpha-medium"
          background="overlay"
          radius="xl"
          overflow="hidden"
        >
          <Column gap={"80"} fillWidth>
            <Column horizontal="center">
              <Media src={"/images/HLL2nkSXsAEAQsC.jpg"} />
              <Avatar
                size={"xl"}
                src={"/images/HLxFYEGXMAA_G8b.jpg"}
                position="absolute"
                translateY="50%"
                bottom="0"
              />
            </Column>
            <Column gap="16" paddingTop="12" paddingBottom="24" fillWidth horizontal="center">
              <Column>
                <Heading variant="heading-strong-xl">Moetsukita</Heading>
                <Text onBackground="neutral-weak" variant="body-default-m">
                  SFW/NSFW artist
                </Text>
              </Column>
              <Line />
              <Column horizontal="center" gap="8" maxWidth={16}>
                {socials.map((social, idx) => (
                  <Button
                    key={`social-button-${idx}`}
                    prefixIcon={social.icon}
                    href={social.url}
                    target={"_blank"}
                    fillWidth
                  >
                    {social.name}
                  </Button>
                ))}
              </Column>
              <BlobFx position="absolute" fill seed={40} translateY="50%" zIndex="-1" />
            </Column>
          </Column>
        </Column>
      </RevealFx>
    </Column>
  );
}
