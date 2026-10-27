/** Gallery filters, as they appear in the URL. */
export type GalleryQuery = {
  text: string;
  tags: string[];
  exclude: string[];
  rating: "all" | "sfw" | "nsfw";
  mine: boolean;
  sort: "new" | "old";
  page: number;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter(Boolean);

/**
 * Reads the URL. `q` also understands `tag:slug`, `-tag:slug` and `rating:sfw`
 * typed into the search box, merged with the dedicated parameters.
 */
export function parseGalleryQuery(
  params: Record<string, string | string[] | undefined>,
): GalleryQuery {
  const tags = new Set(list(first(params.tags)));
  const exclude = new Set(list(first(params.exclude)));
  let rating = first(params.rating);
  const words: string[] = [];

  for (const token of (first(params.q) ?? "").split(/\s+/).filter(Boolean)) {
    const match = /^(-?)(tag|rating):(.+)$/i.exec(token);
    if (!match) words.push(token);
    else if (match[2].toLowerCase() === "rating") rating = match[3].toLowerCase();
    else (match[1] ? exclude : tags).add(match[3].toLowerCase());
  }

  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    text: words.join(" ").slice(0, 200),
    tags: [...tags].slice(0, 10),
    exclude: [...exclude].slice(0, 10),
    rating: rating === "sfw" || rating === "nsfw" ? rating : "all",
    mine: first(params.mine) === "1",
    sort: first(params.sort) === "old" ? "old" : "new",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

/** The URL search string for a query, leaving out defaults. */
export function galleryQueryString(query: Partial<GalleryQuery>) {
  const params = new URLSearchParams();
  if (query.text) params.set("q", query.text);
  if (query.tags?.length) params.set("tags", query.tags.join(","));
  if (query.exclude?.length) params.set("exclude", query.exclude.join(","));
  if (query.rating && query.rating !== "all") params.set("rating", query.rating);
  if (query.mine) params.set("mine", "1");
  if (query.sort === "old") params.set("sort", "old");
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const string = params.toString();
  return string ? `?${string}` : "";
}

/** Escapes LIKE wildcards in user input. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);
