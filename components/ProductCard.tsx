import Link from "next/link";
import Countdown from "./Countdown";
import AddToBagButton from "./AddToBagButton";
import ExpandableImage from "./ExpandableImage";
import EditionBadge from "./EditionBadge";
import { PRODUCT_TYPE_LABELS } from "@/lib/catalogue";

export type ProductVariant = {
  id: string;
  label: string;
  price: number;
  stock: number;
  // Fixed run size for this variant's live countdown badge -- see
  // EditionBadge. Undefined means this variant isn't a limited run
  // (stickers, digital, freebies, or a product using the separate,
  // always-1 isOneOff system instead).
  editionSize?: number;
};

export type Product = {
  id: string;
  artistId: string;
  slug: string;
  stallSlug: string;
  stallName: string;
  name: string;
  // Raw product_category enum value (see supabase/schema.sql) -- rendered
  // via PRODUCT_TYPE_LABELS as a small tag next to the name, since some
  // stalls sell a print and a t-shirt under the identical name (Nuwan's
  // "Fractal Theory", Vdokade's "Susie Splosion") with nothing else on the
  // card to tell them apart.
  category: string;
  imageUrl?: string;
  priceLabel: string; // e.g. "from Rs. 1,000"
  sizeLabel?: string; // e.g. "A6–A3" / "Small–Large" -- prints & stickers only
  stockRemaining?: number; // undefined = not tracked (digital/freebie)
  isBestseller?: boolean;
  isOneOff?: boolean;
  soldCount?: number;
  dropEndsAt?: string;
  // Set only when the vendor's "exclusive drop" toggle is on (see
  // lib/catalogue.ts's computeEditionAggregate) -- collective stock summed
  // across every variant, read against the original combined total. The
  // per-size breakdown itself lives on the product detail page only; this
  // is just the card-level aggregate that a single-variant EditionBadge
  // can't represent once a product has more than one size.
  exclusiveDropStock?: { remaining: number; total: number };
  // Set only when the vendor's "open edition" toggle is on AND nothing about
  // this product would already show a Limited badge (no edition_size set
  // anywhere on it) -- see lib/catalogue.ts's mapProduct. Renders as a plain
  // "X in stock" line instead of the "Only N left" low-stock hint, with no
  // total/edition framing at all.
  openStock?: number;
  variants?: ProductVariant[];
};

// How many cards at the start of a grid get an eager-loaded, priority
// image instead of the library default (lazy). Sized for a narrow
// (mobile) viewport, where cards stack to one column and the first ones
// are immediately visible -- not for the wide desktop grid, which fits
// more per row but isn't what iOS Safari visitors (most of this site's
// traffic) actually see above the fold. Every call site that renders a
// grid of these (stall pages, homepage, search) should mark only the
// first PRIORITY_CARD_COUNT cards priority and leave the rest lazy, or
// this undoes the work already done to keep Cached Egress under quota.
export const PRIORITY_CARD_COUNT = 3;

export default function ProductCard({
  product,
  priority = false,
  showStall = true,
}: {
  product: Product;
  priority?: boolean;
  // Off on the stall's own page (app/stalls/[slug]/page.tsx) -- every card
  // there is already that one stall's, so repeating its name on every card
  // is just noise. On everywhere products from more than one stall sit
  // side by side: the homepage drop, search results. A prop rather than
  // the card inferring its own context (e.g. from the current route)
  // because that context lives with the caller, not the card.
  showStall?: boolean;
}) {
  const soldOut = product.stockRemaining !== undefined && product.stockRemaining <= 0;

  // A single-variant limited-run product (the common case -- most prints
  // only ever have one size) has one unambiguous fraction to show in this
  // corner. A multi-variant product (e.g. A6/A5/A3, each its own run) used
  // to have no single number that represented all of them -- that gap is
  // exactly what exclusiveDropStock (the vendor's "exclusive drop" toggle)
  // fills, so it takes priority here when set.
  const editionVariant =
    !product.isOneOff && !product.exclusiveDropStock && product.variants?.length === 1 && product.variants[0].editionSize != null
      ? product.variants[0]
      : undefined;
  const hasEditionMarker = !product.isOneOff && (!!product.exclusiveDropStock || !!editionVariant);

  return (
    <div
      className={`group relative min-w-0 bg-white border border-line p-3 pb-5 rotate-[-0.6deg] hover:rotate-0 transition-transform ${
        soldOut ? "opacity-50 grayscale" : ""
      }`}
    >
      {product.isBestseller && (
        <span className="absolute -top-2 left-3 bg-ink text-white text-[10px] font-mono uppercase tracking-wide px-2 py-1">
          Bestseller
        </span>
      )}
      {product.isOneOff && (
        <span className="absolute -top-2 right-3 bg-accent text-white text-[10px] font-mono uppercase tracking-wide px-2 py-1">
          1 of 1
        </span>
      )}
      {!product.isOneOff && product.exclusiveDropStock && (
        <EditionBadge
          stock={product.exclusiveDropStock.remaining}
          editionSize={product.exclusiveDropStock.total}
          className="absolute -top-2 right-3"
        />
      )}
      {editionVariant && (
        <EditionBadge
          stock={editionVariant.stock}
          editionSize={editionVariant.editionSize!}
          className="absolute -top-2 right-3"
        />
      )}

      {/* the "polaroid" frame: white border, image at its own natural
          aspect ratio (never cropped), caption strip underneath. Links
          straight to the product page (same target + scroll behavior as
          the name link below) rather than opening the lightbox -- that's
          reserved for the detail page itself (see ExpandableImage's
          linkHref). */}
      <ExpandableImage
        images={product.imageUrl ? [{ src: product.imageUrl, alt: product.name }] : []}
        frameClassName="bg-paper min-h-[8rem] flex items-center justify-center overflow-hidden"
        placeholder={<span className="text-warm-grey text-xs font-mono">photo coming soon</span>}
        linkHref={`/stalls/${product.stallSlug}/products/${product.slug}`}
        linkScroll={false}
        priority={priority}
        protectImage
      />

      <div className="pt-3 px-1">
        <p className="font-mono text-[10px] uppercase tracking-eyebrow text-warm-grey mb-0.5">
          {PRODUCT_TYPE_LABELS[product.category] ?? product.category}
          {showStall && (
            <>
              {" · "}
              <Link href={`/stalls/${product.stallSlug}`} className="hover:text-accent transition-colors">
                {product.stallName}
              </Link>
            </>
          )}
        </p>
        {/* Opens as a layered overlay (intercepting route) when clicked from
            here, but is still a real shareable URL -- see
            app/stalls/[slug]/@modal and app/stalls/[slug]/products. */}
        <Link
          href={`/stalls/${product.stallSlug}/products/${product.slug}`}
          scroll={false}
          className="block font-display text-base leading-tight hover:text-accent transition-colors"
        >
          {product.name}
        </Link>
        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="font-mono">{product.priceLabel}</span>
          {soldOut ? (
            <span className="font-mono text-xs uppercase text-warm-grey">
              {product.isOneOff || hasEditionMarker ? "Sold, won't return" : "Sold out"}
            </span>
          ) : product.isOneOff || hasEditionMarker ? null : product.openStock !== undefined ? (
            <span className="font-mono text-xs text-accent">{product.openStock} in stock</span>
          ) : product.stockRemaining !== undefined && product.stockRemaining <= 10 ? (
            <span className="font-mono text-xs text-accent">
              Only {product.stockRemaining} left
            </span>
          ) : null}
        </div>
        {product.sizeLabel && (
          <p className="mt-0.5 text-xs text-warm-grey font-mono">{product.sizeLabel}</p>
        )}
        {product.dropEndsAt && !soldOut && (
          <p className="mt-1 text-accent">
            <Countdown endsAt={product.dropEndsAt} />
          </p>
        )}
        {!!product.soldCount && product.soldCount > 0 && (
          <p className="mt-1 text-xs text-warm-grey">{product.soldCount} sold</p>
        )}
        {!soldOut && product.variants && product.variants.length > 0 && (
          <AddToBagButton
            productId={product.id}
            productName={product.name}
            imageUrl={product.imageUrl}
            variants={product.variants}
          />
        )}
      </div>
    </div>
  );
}
