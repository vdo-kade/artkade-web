"use client";

import Link from "next/link";
import { useBag } from "./BagProvider";

export default function Header() {
  const { totalItems } = useBag();

  return (
    <header className="sticky top-0 z-40 bg-cream/90 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          {/* EDIT: swap for the real Art Kade logo once you share it */}
          <span className="font-display text-2xl tracking-tight">Art Kade</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 font-body text-sm">
          <Link href="/#stalls" className="hover:text-accent">
            The Stalls
          </Link>
          <Link href="/magazine" className="hover:text-accent">
            Magazine
          </Link>
          <Link href="/#drop" className="hover:text-accent">
            Latest Drop
          </Link>
        </nav>
        <Link
          href="/checkout"
          aria-label="Your bag"
          className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-accent hover:text-accent transition-colors"
        >
          Your Bag{totalItems > 0 ? ` (${totalItems})` : ""}
        </Link>
      </div>
    </header>
  );
}
