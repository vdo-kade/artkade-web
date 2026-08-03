"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// Same-shape stroke icons as SearchForm's search glyph (fill="none",
// stroke="currentColor", strokeWidth 1.5, round caps) -- no icon library in
// this project (see SocialIcon.tsx), so hand-drawn to match.
function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 1.5V3M9 15v1.5M16.5 9H15M3 9H1.5M14.3 3.7l-1.1 1.1M4.8 13.2l-1.1 1.1M14.3 14.3l-1.1-1.1M4.8 4.8L3.7 3.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M15.5 10.4A6.5 6.5 0 1 1 7.6 2.5a5 5 0 0 0 7.9 7.9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Mirrors app/layout.tsx's inline before-paint script: same storage key,
// same "explicit choice wins, otherwise follow system" logic. Reads the
// class the script already set on <html> rather than re-deriving it, so
// there's exactly one place (that script) that decides the initial theme.
//
// Renders a same-sized blank placeholder until mounted rather than reading
// document/localStorage during the initial render -- this is a client
// component but still gets server-rendered first, and the server can't
// know the class the before-paint script added, so rendering a real
// sun/moon icon on that first pass risks a hydration-mismatch flash on the
// icon itself (much smaller stakes than the page-level flash the inline
// script prevents, but the standard fix is the same: don't guess, wait for
// the mount effect).
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);

    // Only auto-follow the OS while no explicit choice has been made --
    // once the visitor has clicked the toggle, that choice persists
    // regardless of what the system preference does afterwards.
    if (localStorage.getItem(THEME_STORAGE_KEY)) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange(e: MediaQueryListEvent) {
      document.documentElement.classList.toggle("dark", e.matches);
      setIsDark(e.matches);
    }
    mql.addEventListener("change", onSystemChange);
    return () => mql.removeEventListener("change", onSystemChange);
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    setIsDark(next);
  }

  if (!mounted) {
    return <span aria-hidden className={`inline-block w-9 h-9 ${className}`} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      // No transition-colors: this icon inherits ink (unpinned, flips
      // with theme -- it lives in the header, not a light-surface), and
      // transition-colors on a var()-based colour that changes with the
      // very toggle this button controls leaves the icon stuck at the
      // pre-toggle colour (see app/not-found.tsx's comment). Of all the
      // places this bug could hide, the toggle button itself would have
      // been the worst.
      className={`flex items-center justify-center w-9 h-9 shrink-0 hover:text-accent ${className}`}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
