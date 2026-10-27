import { type Locale, routing } from "@/i18n/routing";

// Used for SEO in meta tags and schema.
export const baseURL = "https://moetsukita.xyz";

export const person = {
  name: "Moetsukita",
  avatar: "/images/HLxFYEGXMAA_G8b.jpg",
  cover: "/images/HLL2nkSXsAEAQsC.jpg",
};

/** Path of a page in the given locale; the default locale has no prefix. */
export function localizedPath(locale: Locale, path = "/") {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** hreflang alternates for every locale, in the shape Meta.generate expects. */
export function alternates(path = "/") {
  return routing.locales.map((locale) => ({
    href: `${baseURL}${localizedPath(locale, path)}`,
    hrefLang: locale,
  }));
}
