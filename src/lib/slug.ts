/** URL slug from a title; non-Latin titles fall back to `fallback`. */
export function slugify(text: string, fallback = "work") {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || fallback;
}

export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
