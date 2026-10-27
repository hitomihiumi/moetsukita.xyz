"use client";

import { Button } from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { confirmAge } from "@/server/gallery/actions";

export function AgeConfirmButton({ label, size = "m" }: { label: string; size?: "s" | "m" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await confirmAge();
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
