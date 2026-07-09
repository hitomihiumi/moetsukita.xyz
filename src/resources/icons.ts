import { IconType } from "react-icons";

import {
  HiOutlineRocketLaunch,
} from "react-icons/hi2";

import { FaXTwitter, FaPixiv, FaInstagram, FaPatreon, FaTelegram, FaGithub } from "react-icons/fa6";



export const iconLibrary: Record<string, IconType> = {
  rocket: HiOutlineRocketLaunch,
  twitter: FaXTwitter,
  pixiv: FaPixiv,
  instagram: FaInstagram,
  patreon: FaPatreon,
  telegram: FaTelegram,
  github: FaGithub,
};

export type IconLibrary = typeof iconLibrary;
export type IconName = keyof IconLibrary;