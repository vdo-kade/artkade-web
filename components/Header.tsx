"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useBag } from "./BagProvider";
import { SHORT_LOGO_URL, LOGO_OUTLINE_FILTER_SMALL } from "@/lib/brand";

const NAV_LINKS = [
  { href: "/#stalls", label: "The Stalls" },
  { href: "/magazine", label: "Magazine" },
  { href: "/freebies", label: "Freebies" },
  { href: "/#drop", label: "Latest Drop" },
];

export default function Header() {
  const { totalItems } = useBag();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    // pt-[env(...)] keeps the header's own cream background sitting flush
    // against the true top edge of the screen (behind the status bar/
    // notch, now that app/layout.tsx's viewport export sets
    // viewportFit: "cover") while pushing the actual logo/nav/hamburger
    // content down clear of the notch -- the padding, not the header's
    // position, is what "fits" it to the screen.
    <header className="sticky top-0 z-40 bg-cream/90 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3" onClick={() => setMenuOpen(false)}>
          {/*
            The short "AX" mark sits transparent directly on the cream
            header (no backing plate) -- its neutral triangle-eye element
            is pure white, ~1.1:1 against cream on its own, so a single
            soft/ambient shadow wouldn't create a legible edge. Instead
            LOGO_OUTLINE_FILTER_SMALL stacks several 0-blur drop-shadows in
            a ring around the artwork's silhouette (a hard-edged pseudo-
            stroke in `ink`, the same dark token already proven legible as
            this site's default body-text-on-cream colour) plus one larger
            soft shadow underneath for depth -- see lib/brand.ts.
          */}
          <img
            src={SHORT_LOGO_URL}
            alt="Art Kade"
            className="h-9 w-auto"
            style={{ filter: LOGO_OUTLINE_FILTER_SMALL }}
          />
        </Link>
        <nav className="hidden md:flex items-center gap-8 font-body text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-accent">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/checkout"
            aria-label="Your bag"
            className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            Your Bag{totalItems > 0 ? ` (${totalItems})` : ""}
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="md:hidden flex flex-col justify-center items-center gap-1.5 w-9 h-9 shrink-0"
          >
            <span
              className={`block h-0.5 w-6 bg-ink transition-transform duration-200 ${
                menuOpen ? "rotate-45 translate-y-2" : ""
              }`}
            />
            <span className={`block h-0.5 w-6 bg-ink transition-opacity duration-200 ${menuOpen ? "opacity-0" : ""}`} />
            <span
              className={`block h-0.5 w-6 bg-ink transition-transform duration-200 ${
                menuOpen ? "-rotate-45 -translate-y-2" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {menuOpen &&
        // Portalled to document.body: the header has backdrop-blur, and
        // backdrop-filter (like transform/filter) makes its box the
        // containing block for `position: fixed` descendants -- without the
        // portal this "fullscreen" backdrop would only span the header's
        // own bounding box instead of the viewport, so taps further down
        // the page wouldn't reach it at all.
        createPortal(
          <div
            className="md:hidden fixed inset-0 z-30 bg-ink/20"
            aria-hidden
            onClick={() => setMenuOpen(false)}
          />,
          document.body
        )}

      {menuOpen && (
        <nav className="md:hidden relative z-40 border-t border-line bg-cream px-6 py-6 flex flex-col gap-5 font-display text-2xl">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-accent" onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
