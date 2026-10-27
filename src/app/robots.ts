import type { MetadataRoute } from "next";
import { baseURL } from "@/resources/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/account",
        "/login",
        "/ru/account",
        "/ru/login",
        "/ja/account",
        "/ja/login",
      ],
    },
    sitemap: `${baseURL}/sitemap.xml`,
  };
}
