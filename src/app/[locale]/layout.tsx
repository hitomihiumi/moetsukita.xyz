import "@once-ui-system/core/css/styles.css";
import "@once-ui-system/core/css/tokens.css";
import "@/resources/custom.css";

import { Background, Column, Meta, Row, ThemeInit } from "@once-ui-system/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Footer, Header, Providers } from "@/components";
import { routing } from "@/i18n/routing";
import { fonts } from "@/resources/fonts";
import { dataStyle, style } from "@/resources/once-ui.config";
import { alternates, baseURL, localizedPath, person } from "@/resources/seo";

type Props = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Meta" });
  const path = localizedPath(locale);

  return Meta.generate({
    title: t("title"),
    description: t("description"),
    baseURL,
    path,
    canonical: `${baseURL}${path}`,
    image: person.cover,
    robots: "index,follow",
    alternates: alternates(),
  });
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <Row
      as="html"
      lang={locale}
      suppressHydrationWarning
      fillWidth
      className={Object.values(fonts)
        .map((font) => font.variable)
        .join(" ")}
    >
      <head>
        {/* Sets data-theme and the scheme before first paint. */}
        <ThemeInit config={style} dataStyle={dataStyle} />
      </head>
      <Providers>
        <Column as="body" background="page" fillWidth margin="0" padding="0" minHeight="100vh">
          <NextIntlClientProvider>
            <Background
              position="absolute"
              top="0"
              left="0"
              fill
              pointerEvents="none"
              mask={{ x: 90, y: 10 }}
              dots={{ display: true, opacity: 100, size: "8", color: "brand-background-strong" }}
            />
            <Background
              position="absolute"
              top="0"
              left="0"
              fill
              pointerEvents="none"
              gradient={{
                display: true,
                opacity: 30,
                x: 10,
                y: 90,
                colorStart: "brand-background-strong",
                colorEnd: "accent-background-weak",
              }}
            />
            <Header />
            <Column as="main" fill zIndex={1}>
              {children}
            </Column>
            <Footer />
          </NextIntlClientProvider>
        </Column>
      </Providers>
    </Row>
  );
}
