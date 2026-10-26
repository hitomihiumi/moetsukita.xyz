/**
 * A same-site path to return to after signing in, or the fallback. Rejects
 * absolute and protocol-relative URLs so the parameter cannot redirect off-site.
 */
export function safeCallbackPath(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
