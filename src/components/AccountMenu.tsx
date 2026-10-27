"use client";

import { Column, Line, Option, UserMenu } from "@once-ui-system/core";
import { useTranslations } from "next-intl";
import { useRef } from "react";

type AccountMenuProps = {
  name: string;
  image: string | null;
  subline: string;
  accountHref: string;
  /** Shown to editors and admins. */
  adminHref?: string;
  homePath: string;
  signOut: (formData: FormData) => Promise<void>;
};

export function AccountMenu({
  name,
  image,
  subline,
  accountHref,
  adminHref,
  homePath,
  signOut,
}: AccountMenuProps) {
  const t = useTranslations("Header");
  const form = useRef<HTMLFormElement>(null);

  return (
    <>
      <UserMenu
        name={name}
        subline={subline}
        avatarProps={{ src: image ?? undefined, value: image ? undefined : name.slice(0, 1) }}
        placement="bottom-end"
        aria-label={t("menu")}
        dropdown={
          <Column padding="4" gap="2" minWidth={12}>
            <Option value="account" label={t("account")} href={accountHref} />
            {adminHref && <Option value="admin" label={t("admin")} href={adminHref} />}
            <Line marginY="4" />
            <Option
              value="sign-out"
              label={t("signOut")}
              danger
              onClick={() => form.current?.requestSubmit()}
            />
          </Column>
        }
      />
      <form ref={form} action={signOut} hidden>
        <input type="hidden" name="callbackUrl" value={homePath} />
      </form>
    </>
  );
}
