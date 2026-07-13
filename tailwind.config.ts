import type { Config } from "tailwindcss";

/**
 * Design tokens for Art Kade.
 * Palette: warm cream + charcoal, with a saffron-ochre accent (Sri Lankan
 * spice-market warmth, not a generic AI-cream-and-terracotta default).
 * Each artist stall can override --accent via inline CSS variables later,
 * this is the site-wide default (the Art Kade brand itself).
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#F5EFE4",
        paper: "#EFE7D8",
        white: "#FFFDF8",
        charcoal: "#2A2520",
        ink: "#1C1712",
        "warm-grey": "#8B8175",
        accent: "#C08A2E",
        line: "rgba(28,23,18,0.12)",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-work-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      letterSpacing: {
        eyebrow: "0.14em",
      },
    },
  },
  plugins: [],
};
export default config;
