"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

// Overlay shell for the intercepted product route (app/stalls/[slug]/
// @modal/(.)products/[productSlug]). The underlying stall page is still
// mounted behind this the whole time -- router.back() just returns to it,
// so its scroll position was never actually lost, unlike a full page nav.
export default function ProductModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [router]);

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[90] bg-ink/50 overflow-y-auto"
      onClick={(e) => {
        if (e.target === overlayRef.current) router.back();
      }}
    >
      <div className="min-h-full flex items-start sm:items-center justify-center sm:p-6">
        <div className="relative bg-cream w-full sm:max-w-4xl sm:my-10 shadow-2xl">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close"
            className="absolute top-[calc(env(safe-area-inset-top)_+_0.75rem)] right-4 z-10 bg-white/90 hover:bg-white text-ink rounded-full w-9 h-9 flex items-center justify-center text-2xl leading-none shadow"
          >
            &times;
          </button>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
