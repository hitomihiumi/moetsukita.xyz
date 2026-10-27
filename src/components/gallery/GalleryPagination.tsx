"use client";

import { Pagination } from "@once-ui-system/core";
import { usePathname, useRouter } from "@/i18n/navigation";
import { type GalleryQuery, galleryQueryString } from "@/lib/search";

export function GalleryPagination({
  query,
  total,
  perPage,
}: {
  query: GalleryQuery;
  total: number;
  perPage: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (total <= perPage) return null;
  return (
    <Pagination
      page={query.page}
      total={total}
      perPage={perPage}
      onChange={(page) => router.push(`${pathname}${galleryQueryString({ ...query, page })}`)}
    />
  );
}
