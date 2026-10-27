import type { OnceUIDataStyleConfig, OnceUIStyleConfig } from "@once-ui-system/core";

export const style: OnceUIStyleConfig = {
  // "dark" or "light" here locks the theme and the switcher stops working.
  // Keep "system" and pick what a first visit sees with defaultTheme.
  theme: "system",
  defaultTheme: "system", // dark | light | system
  neutral: "gray", // sand | gray | slate | rose | mint | dusk
  brand: "emerald", // blue | indigo | violet | magenta | pink | red | orange | yellow | moss | green | emerald | aqua | cyan
  accent: "moss", // same names as brand
  solid: "contrast", // color | contrast | inverse
  solidStyle: "flat", // flat | plastic
  border: "playful", // rounded | playful | conservative | sharp
  surface: "filled", // filled | translucent
  transition: "all", // all | micro | macro
  scaling: "100", // 90 | 95 | 100 | 105 | 110
};

export const dataStyle: OnceUIDataStyleConfig = {
  variant: "gradient", // flat | gradient | outline
  mode: "categorical", // categorical | divergent | sequential
  height: 24,
  axis: { stroke: "var(--neutral-alpha-weak)" },
  tick: { fill: "var(--neutral-on-background-weak)", fontSize: 11, line: false },
};
