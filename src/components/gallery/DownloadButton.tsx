"use client";

import { Button, useToast } from "@once-ui-system/core";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

type ErrorCode = "unauthorized" | "forbidden" | "age" | "not_found" | "rate_limited" | "failed";

/** Asks for a fresh short-lived link and starts the download; the link is never shown or reused. */
export function DownloadButton({
  assetId,
  label,
  size = "s",
}: {
  assetId: string;
  label: string;
  size?: "s" | "m";
}) {
  const t = useTranslations("Downloads");
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size={size}
      variant="secondary"
      prefixIcon="download"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const response = await fetch("/api/downloads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId }),
          });
          const result = (await response.json().catch(() => ({ error: "failed" }))) as
            | { url: string }
            | { error: ErrorCode };
          if ("url" in result) {
            window.location.assign(result.url);
            addToast({ variant: "success", message: t("started") });
          } else {
            addToast({ variant: "danger", message: t(`errors.${result.error}`) });
          }
        })
      }
    >
      {label}
    </Button>
  );
}
