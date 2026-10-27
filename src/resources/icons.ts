import type { IconComponent } from "@once-ui-system/core";
import {
  FaDiscord,
  FaGithub,
  FaInstagram,
  FaPatreon,
  FaPixiv,
  FaTelegram,
  FaXTwitter,
} from "react-icons/fa6";

// Brand marks are not part of Once UI's built-in set, so they are registered here.
export const iconLibrary = {
  twitter: FaXTwitter,
  pixiv: FaPixiv,
  instagram: FaInstagram,
  patreon: FaPatreon,
  telegram: FaTelegram,
  github: FaGithub,
  discord: FaDiscord,
} satisfies Record<string, IconComponent>;

type CustomIcons = { [K in keyof typeof iconLibrary]: true };

declare module "@once-ui-system/core" {
  interface IconLibraryOverrides extends CustomIcons {}
}
