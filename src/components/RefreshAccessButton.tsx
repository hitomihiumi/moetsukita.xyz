"use client";

import { Button, useToast } from "@once-ui-system/core";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { refreshAccess } from "@/server/auth/actions";

export function RefreshAccessButton() {
  const t = useTranslations("Account");
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="s"
      prefixIcon="refresh"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshAccess();
          if (result.ok) addToast({ variant: "success", message: t("refreshed") });
        })
      }
    >
      {t("refresh")}
    </Button>
  );
}
