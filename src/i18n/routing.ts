import { defineRouting } from "next-intl/routing";

export const locales = ["en", "ru", "ja"] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  ja: "日本語",
};

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  // "/" stays English, other languages live under "/ru" and "/ja".
  localePrefix: "as-needed",
});
