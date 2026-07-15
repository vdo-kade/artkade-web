"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-eyebrow text-accent mb-4">
        Something broke
      </p>
      <h1 className="font-display text-4xl mb-4">That didn&apos;t work</h1>
      <p className="text-warm-grey mb-8">
        Sorry about that -- something went wrong loading this page. Your bag
        is safe, it&apos;s stored on your device.
      </p>
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={reset}
          className="bg-ink text-white px-7 py-3 text-sm font-medium hover:bg-accent transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="border border-line px-7 py-3 text-sm font-medium hover:border-accent hover:text-accent transition-colors"
        >
          Back to Art Kade
        </Link>
      </div>
    </section>
  );
}
