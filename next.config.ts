import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  sassOptions: {
    compiler: "modern",
    silenceDeprecations: ["legacy-js-api"],
  },
  experimental: {
    // Without this, a server component that imports from the package root
    // ships about 110 kB of extra JavaScript on every route.
    optimizePackageImports: ["@once-ui-system/core"],
  },
};

export default withNextIntl(nextConfig);
