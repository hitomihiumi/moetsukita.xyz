import { Geist_Mono, Inter, Lexend, Sora } from "next/font/google";

// Sora and Lexend have no Cyrillic or Japanese glyphs: those fall through to
// the system fonts in `fallback`. next/font only accepts literals, hence the repetition.
const heading = Sora({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
  fallback: ["Hiragino Sans", "Yu Gothic UI", "Meiryo", "system-ui", "sans-serif"],
});

const body = Lexend({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
  fallback: ["Hiragino Sans", "Yu Gothic UI", "Meiryo", "system-ui", "sans-serif"],
});

const label = Inter({
  variable: "--font-label",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  fallback: ["Hiragino Sans", "Yu Gothic UI", "Meiryo", "system-ui", "sans-serif"],
});

const code = Geist_Mono({
  variable: "--font-code",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const fonts = { heading, body, label, code };
