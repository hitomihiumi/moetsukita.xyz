import type { IconName } from "@once-ui-system/core";

export type Social = { name: string; url: string; icon: IconName };

export const fanboxUrl = "https://moetsukita.fanbox.cc/";
export const patreonUrl = "https://www.patreon.com/c/Moetsukita";

export const socials: Social[] = [
  { name: "Twitter (SFW)", url: "https://x.com/a1ttri", icon: "twitter" },
  { name: "Twitter (NSFW)", url: "https://x.com/a1ttri1", icon: "twitter" },
  { name: "Pixiv", url: "https://www.pixiv.net/en/users/79540158", icon: "pixiv" },
  { name: "Fanbox", url: fanboxUrl, icon: "pixiv" },
  { name: "Patreon", url: patreonUrl, icon: "patreon" },
  { name: "Telegram (RU)", url: "https://t.me/Moetsukita", icon: "telegram" },
  { name: "Instagram", url: "https://www.instagram.com/1moetsukita/", icon: "instagram" },
];
