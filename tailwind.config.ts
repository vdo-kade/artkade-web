import type { Config } from "tailwindcss";

/**
 * Design tokens for Art Kade.
 * Palette: warm cream + charcoal, with a saffron-ochre accent (Sri Lankan
 * spice-market warmth, not a generic AI-cream-and-terracotta default).
 * Each artist stall can override --accent via inline CSS variables later,
 * this is the site-wide default (the Art Kade brand itself).
 *
 * Every colour below resolves through a CSS custom property (see
 * app/globals.css) rather than a fixed hex, so the same class names
 * (bg-cream, text-ink, border-line, ...) work unchanged in both themes --
 * `.dark` on <html> only needs to redeclare the three that actually differ
 * (cream/ink/line, the page canvas and what sits directly on it); the rest
 * (paper/white/accent/warm-grey/charcoal) are never redeclared, so they
 * stay exactly what they are today regardless of theme. See globals.css's
 * `.light-surface` for the flip side: cards, boxes, and solid ink-filled
 * buttons need to stay light even inside a dark page, so that class re-pins
 * cream/ink/line back to their light-mode values for its own subtree.
 */
// defaultOpacityVar (line only) points the no-modifier case at its own CSS
// variable too, rather than a fixed JS number -- .dark uses a very slightly
// higher default (0.14 vs 0.12) since the same subtle-border feel needs a
// touch more opacity on a light-on-dark line than a dark-on-light one. An
// explicit /NN modifier (e.g. border-line/60) always wins regardless.
function withOpacity(variable: string, defaultOpacityVar?: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) return `rgb(var(${variable}) / ${opacityValue})`;
    return defaultOpacityVar ? `rgb(var(${variable}) / var(${defaultOpacityVar}))` : `rgb(var(${variable}))`;
  };
}

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Cast through unknown: tailwindcss's own Config type still models
      // `colors` as plain string leaves (RecursiveKeyValuePair<string,
      // string>), not the ({opacityValue}) => string function form -- even
      // though that form is real, documented, supported Tailwind API
      // (exactly this pattern, for exactly this "CSS variable with
      // Tailwind-native opacity modifiers" use case). A known gap in their
      // shipped .d.ts, not a sign this doesn't work at runtime.
      colors: {
        cream: withOpacity("--color-cream"),
        paper: withOpacity("--color-paper"),
        white: withOpacity("--color-white"),
        charcoal: withOpacity("--color-charcoal"),
        ink: withOpacity("--color-ink"),
        "warm-grey": withOpacity("--color-warm-grey"),
        accent: withOpacity("--color-accent"),
        // Only token with a non-1 default opacity -- every pre-existing
        // bare `border-line`/`bg-line` usage relied on the always-subtle
        // rgba(...,0.12) it used to be; an explicit /NN modifier (e.g.
        // border-line/60) still overrides this default, same as any other
        // Tailwind opacity-modified colour.
        line: withOpacity("--color-line", "--line-opacity"),
      } as unknown as Record<string, string>,
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
