import Link from "next/link";
import Countdown from "./Countdown";
import AddToBagButton from "./AddToBagButton";
import ExpandableImage from "./ExpandableImage";
import SizeGuideButton from "./SizeGuideButton";
import ViewTracker from "./ViewTracker";
import RecentlyViewed from "./RecentlyViewed";
import EditionBadge from "./EditionBadge";
import { PRODUCT_TYPE_LABELS, type ProductDetail as ProductDetailData } from "@/lib/catalogue";

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
            protectImage
          />
        </div>

        <div>
          <Link
            href={`/stalls/${product.stallSlug}`}
            className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey hover:text-accent transition-colors"
          >
            {product.stallName}
          </Link>
          <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mt-1">
            {PRODUCT_TYPE_LABELS[product.category] ?? product.category}
          </p>
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
            {isApparel && <SizeGuideButton customImageUrl={product.sizingChartUrl} />}
          </div>

          <p className="mt-4 text-xs text-warm-grey">
            <span className="font-medium text-ink">Free shipping on everything.</span> Orders
            close Friday midnight. Allow at least two weeks for delivery. We pack every order
            by hand over the weekend.
          </p>

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

          {/* Per-tier price+stock breakdown for prints (the only real
              size/material data this catalogue has, no separate material
              field exists) and t-shirts (each size is its own limited run --
              see EditionBadge). Stickers and other categories rely on the
              variant selector above instead. */}
          {(isPrint || isApparel) && product.variants.length > 0 && (
            <div className="mt-6">
              <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
                Available sizes
              </p>
              {/* Shared-pool products (product.sharedStock set) run one
                  edition across every sibling size, not one each -- shown
                  once here instead of repeated per row, or "50 of 50 left"
                  next to all five sizes reads as 250 total. */}
              {product.sharedStock && (
                <p className="mb-2 flex items-center gap-2">
                  <EditionBadge stock={product.sharedStock.remaining} editionSize={product.sharedStock.total} />
                  <span className="text-xs text-warm-grey">across all sizes</span>
                </p>
              )}
              {/* Open-edition sibling of the block above: same one-line-for-
                  the-whole-pool treatment, but no total to show against. */}
              {!product.sharedStock && product.openStock !== undefined && (
                <p className="mb-2 flex items-center gap-2">
                  <span className="bg-accent text-white text-[10px] font-mono uppercase tracking-wide px-2 py-1 whitespace-nowrap">
                    {product.openStock > 0 ? `${product.openStock} in stock` : "Sold out"}
                  </span>
                  <span className="text-xs text-warm-grey">across all sizes</span>
                </p>
              )}
              <ul className="text-sm">
                {product.variants.map((v) => {
                  const showCombined = !!product.sharedStock || product.openStock !== undefined;
                  return (
                    <li
                      key={v.id}
                      className="flex justify-between items-center gap-3 border-b border-line/60 py-1.5"
                    >
                      <span>{v.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-warm-grey">
                          Rs. {v.price.toLocaleString("en-US")}
                          {!showCombined && v.editionSize == null && !product.isOpenEdition && v.stock <= 0
                            ? " · sold out"
                            : ""}
                        </span>
                        {!showCombined && v.editionSize != null && (
                          <EditionBadge stock={v.stock} editionSize={v.editionSize} />
                        )}
                        {!showCombined && v.editionSize == null && product.isOpenEdition && (
                          <span className="font-mono text-xs text-accent">
                            {v.stock > 0 ? `${v.stock} in stock` : "Sold out"}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <RecentlyViewed excludeProductId={product.id} />
    </div>
  );
}
