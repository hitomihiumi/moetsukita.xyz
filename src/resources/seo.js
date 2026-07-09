// IMPORTANT: Replace with your own domain address - it's used for SEO in meta tags and schema
const baseURL = "https://moetsukita.xyz";

// metadata for pages
const meta = {
  home: {
    path: "/",
    title: "Moetsukita",
    description:
      "SFW/NSFW artist, illustrator, and content creator. Explore my portfolio, commissions, and more.",
    image: "/images/og/home.jpg",
    canonical: "https://moetsukita.xyz",
    robots: "index,follow",
    alternates: [{ href: "https://moetsukita.xyz", hrefLang: "en" }],
  },
  // add more routes and reference them in page.tsx
};

// default schema data
const schema = {
  logo: "",
  type: "Person",
  name: "Moetsukita",
  description: meta.home.description,
  email: "",
};

export { meta, schema, baseURL };
