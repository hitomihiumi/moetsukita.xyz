import type { Localized } from "@/server/db/schema";

/** The text in the given language, else English, else any language that has it. */
export function pickLocalized(value: Localized | null | undefined, locale: string) {
  if (!value) return "";
  return (
    value[locale as keyof Localized] ??
    value.en ??
    Object.values(value).find((text) => text && text.length > 0) ??
    ""
  );
}
