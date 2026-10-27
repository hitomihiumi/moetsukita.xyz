import type { MetadataRoute } from "next";
import { alternates } from "@/resources/seo";
import { sitemapWorks } from "@/server/gallery/works";

export const revalidate = 3600;

const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => {
  const languages = Object.fromEntries(alternates(path).map((a) => [a.hrefLang, a.href]));
  return { url: languages.en, lastModified, alternates: { languages } };
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Without a database (a build before env is set) the static pages still get listed.
  const works = await sitemapWorks().catch(() => []);
  return [
    entry("/"),
    entry("/gallery"),
    ...works.map((work) => entry(`/gallery/${work.slug}`, work.updatedAt)),
  ];
}
