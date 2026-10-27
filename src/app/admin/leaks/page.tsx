import type { Metadata } from "next";
import { LeakChecker } from "@/components/admin";
import { requirePageRole } from "@/server/admin/guard";

// Reading a watermark tries every offset and several sizes.
export const maxDuration = 300;

export const metadata: Metadata = { title: "Leak check" };

export default async function LeaksPage() {
  await requirePageRole("admin");
  return <LeakChecker />;
}
