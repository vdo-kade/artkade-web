import Link from "next/link";
import Countdown from "./Countdown";
import AddToBagButton from "./AddToBagButton";
import ExpandableImage from "./ExpandableImage";
import SizeGuideButton from "./SizeGuideButton";
import ViewTracker from "./ViewTracker";
import RecentlyViewed from "./RecentlyViewed";
import type { ProductDetail as ProductDetailData } from "@/lib/catalogue";

// Shared by both the real page (app/stalls/[slug]/products/[productSlug])
// and the intercepted-route modal (app/stalls/[slug]/@modal) -- only the
// shell around it differs (full page w/ Header+Footer vs. an overlay
// panel), so the actual product content lives in exactly one place.
export default function ProductDetail({ product }: { product: ProductDetailData }) {
  const stockRemaining = product.variants.reduce((sum, v) => sum + v.stock, 0);
  const soldOut = stockRemaining <= 0;
  const isApparel = product.category === "tshirt";
  const isPrint = product.category === "print";

  return (
    <div className="p-6 sm:p-10">
      <ViewTracker
        product={{
          productId: product.id,
          slug: product.slug,
          stallSlug: product.stallSlug,
          name: product.name,
          imageUrl: product.images[0]?.src,
        }}
      />
      <div className="grid md:grid-cols-2 gap-8 md:gap-12">
        <div>
          <ExpandableImage
            images={product.images}
            frameClassName="bg-paper flex items-center justify-center overflow-hidden"
            placeholder={<span className="text-warm-grey text-xs font-mono">photo coming soon</span>}
            sizes="(min-width: 768px) 480px, 90vw"
          />
        </div>

        <div>
          <Link
            href={`/stalls/${product.stallSlug}`}
            className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey hover:text-accent transition-colors"
          >
            {product.stallName}
          </Link>
          <h1 className="font-display text-3xl mt-1 mb-3">{product.name}</h1>

          {product.dropEndsAt && !soldOut && (
            <p className="mb-3 text-accent">
              <Countdown endsAt={product.dropEndsAt} />
            </p>
          )}

          <div className="flex items-center gap-3">
            {!soldOut && product.variants.length > 0 && (
              <AddToBagButton
                productId={product.id}
                productName={product.name}
                imageUrl={product.images[0]?.src}
                variants={product.variants}
              />
            )}
            {isApparel && <SizeGuideButton />}
          </div>

          {soldOut && (
            <p className="mt-3 font-mono text-xs uppercase text-warm-grey">
              {product.isOneOff ? "Sold, won't return" : "Sold out"}
            </p>
          )}

          {!!product.soldCount && (
            <p className="mt-3 text-xs text-warm-grey">{product.soldCount} sold</p>
          )}

          {product.description && (
            <p className="mt-6 text-warm-grey whitespace-pre-line">{product.description}</p>
          )}

          {/* Material/size info for prints -- the actual per-tier price+stock
              breakdown, since that's the only real size/material data this
              catalogue has (no separate material field exists). Stickers and
              other categories rely on the variant selector above for that. */}
          {isPrint && product.variants.length > 0 && (
            <div className="mt-6">
              <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
                Available sizes
              </p>
              <ul className="text-sm">
                {product.variants.map((v) => (
                  <li
                    key={v.id}
                    className="flex justify-between border-b border-line/60 py-1.5"
                  >
                    <span>{v.label}</span>
                    <span className="font-mono text-warm-grey">
                      Rs. {v.price.toLocaleString("en-US")}
                      {v.stock <= 0 ? " · sold out" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <RecentlyViewed excludeProductId={product.id} />
    </div>
  );
}
