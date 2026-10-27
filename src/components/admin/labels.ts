export const statusTag = {
  draft: { scheme: "neutral", label: "Draft" },
  scheduled: { scheme: "warning", label: "Scheduled" },
  published: { scheme: "success", label: "Published" },
} as const;

export const ratingTag = {
  sfw: { scheme: "info", label: "SFW" },
  nsfw: { scheme: "danger", label: "NSFW" },
} as const;

export const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
