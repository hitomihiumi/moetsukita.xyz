import '@once-ui-system/core/css/styles.css';
import '@once-ui-system/core/css/tokens.css';
import '@/resources/custom.css'

import classNames from "classnames";

import { baseURL, meta } from "@/resources/seo";
import { fonts, style, dataStyle } from "@/resources/once-ui.config";
import {Meta, Schema, Column, Flex, Mask, MatrixFx, ThemeInit, Background} from "@once-ui-system/core";
import { Providers } from '@/components/Providers';
import {Footer} from "@/components/Footer";

export async function generateMetadata() {
  return Meta.generate({
    title: meta.home.title,
    description: meta.home.description,
    baseURL: baseURL,
    path: meta.home.path,
    canonical: meta.home.canonical,
    image: meta.home.image,
    robots: meta.home.robots,
    alternates: meta.home.alternates,
  });
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Flex
      suppressHydrationWarning
      as="html"
      lang="en"
      fillWidth
      className={classNames(
        fonts.heading.variable,
        fonts.body.variable,
        fonts.label.variable,
        fonts.code.variable,
      )}
    >
      <Schema
        as="webPage"
        baseURL={baseURL}
        title={meta.home.title}
        description={meta.home.description}
        path={meta.home.path}
      />
      <head>
        <ThemeInit
          config={{
            theme: style.theme,
            brand: style.brand,
            accent: style.accent,
            neutral: style.neutral,
            solid: style.solid,
            'solid-style': style.solidStyle,
            border: style.border,
            surface: style.surface,
            transition: style.transition,
            scaling: style.scaling,
            'viz-style': dataStyle.variant,
          }}
        />
      </head>
      <Providers>
        <Column
            as="body"
            background="page"
            fillWidth
            margin="0"
            padding="0"
            style={{ minHeight: "100vh" }}>
            <Background
                position='absolute'
                fill
                mask={{
                    x: 90,
                    y: 10
                }}
                dots={{
                    display: true,
                    opacity: 100,
                    size: "8",
                    color: "brand-background-strong"
                }}
            />
            <Background
                position='absolute'
                fill
                gradient={{
                    display: true,
                    opacity: 30,
                    x: 10,
                    y: 90,
                    colorStart: "brand-background-strong",
                    colorEnd: "accent-background-weak"
                }}
            />
          <Column fill>
              {children}
          </Column>
          <Footer/>
        </Column>
      </Providers>
    </Flex>
  );
}
