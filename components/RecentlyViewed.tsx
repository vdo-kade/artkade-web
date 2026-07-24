"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getRecentlyViewed, type ViewedProduct } from "@/lib/recentlyViewed";

// Real view history (see lib/recentlyViewed.ts), not "each stall's latest
// drop" -- localStorage can only be read client-side, so this renders
// nothing until mount, then fills in from whatever's actually been viewed
// in this browser. excludeProductId keeps the page you're already looking
// at from listing itself.
export default function RecentlyViewed({ excludeProductId }: { excludeProductId: string }) {
  const [items, setItems] = useState<ViewedProduct[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed().filter((p) => p.productId !== excludeProductId));
  }, [excludeProductId]);

  if (items.length === 0) return null;

  return (
    <div className="mt-12 pt-8 border-t border-line">
      <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-4">
        Recently viewed
      </p>
      <div className="flex gap-4 overflow-x-auto">
        {items.map((p) => (
          <Link
            key={p.productId}
            href={`/stalls/${p.stallSlug}/products/${p.slug}`}
            scroll={false}
            className="group shrink-0 w-24"
          >
            <div className="aspect-square bg-paper overflow-hidden mb-1.5">
              {p.imageUrl && (
                <Image
                  src={p.imageUrl}
                  alt={p.name}
                  width={192}
                  height={192}
                  sizes="96px"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              )}
            </div>
            <p className="text-xs leading-tight truncate group-hover:text-accent transition-colors">
              {p.name}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
