"use client";

import { ThemeSwitcher } from "@once-ui-system/core";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
  const t = useTranslations("ThemeSwitcher");

  return <ThemeSwitcher labels={{ system: t("system"), dark: t("dark"), light: t("light") }} />;
}
