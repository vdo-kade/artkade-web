"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Scrolls the just-created product into view and shows a brief confirmation,
// then strips ?created= from the URL so a refresh doesn't repeat either.
// createProduct (app/vendor/actions.ts) redirects here instead of just
// revalidating, specifically so this component gets a real mount to hook
// the scroll/toast off of.
export default function NewProductToast({ createdId }: { createdId: string }) {
  const router = useRouter();

  useEffect(() => {
    document.getElementById(`product-${createdId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete("created");
      const qs = params.toString();
      router.replace(qs ? `/vendor?${qs}` : "/vendor", { scroll: false });
    }, 2000);
    return () => clearTimeout(timer);
  }, [createdId, router]);

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        background: "#1a7f37",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 6,
        fontSize: 13,
        zIndex: 50,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      Product added ✓
    </div>
  );
}
