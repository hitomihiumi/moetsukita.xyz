"use client";

import { Button, Column, DropdownWrapper, Option } from "@once-ui-system/core";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { type Locale, localeNames, routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const select = (next: string) => {
    startTransition(() => router.replace(pathname, { locale: next as Locale }));
  };

  return (
    <DropdownWrapper
      placement="top-end"
      selectedOption={locale}
      onSelect={select}
      trigger={
        <Button
          variant="ghost"
          size="s"
          prefixIcon="globe"
          suffixIcon="chevronDown"
          loading={pending}
          aria-label={t("label")}
        >
          {localeNames[locale]}
        </Button>
      }
      dropdown={
        <Column padding="4" gap="2" minWidth={10}>
          {routing.locales.map((code) => (
            <Option key={code} value={code} label={localeNames[code]} selected={code === locale} />
          ))}
        </Column>
      }
    />
  );
}
