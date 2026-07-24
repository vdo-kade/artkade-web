"use client";

import { useEffect } from "react";
import { recordView, type ViewedProduct } from "@/lib/recentlyViewed";

// Records a product view into localStorage the moment its detail page (or
// the intercepted-route modal rendering the same content) mounts. Renders
// nothing -- ProductDetail is a Server Component, so the actual write has
// to happen from a small client child instead.
export default function ViewTracker({ product }: { product: ViewedProduct }) {
  useEffect(() => {
    recordView(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.productId]);

  return null;
}
