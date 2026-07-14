import Countdown from "./Countdown";
import AddToBagButton from "./AddToBagButton";

export type ProductVariant = {
  id: string;
  label: string;
  price: number;
  stock: number;
};

export type Product = {
  id: string;
  name: string;
  imageUrl?: string;
  priceLabel: string; // e.g. "from Rs. 1,000"
  stockRemaining?: number; // undefined = not tracked (digital/freebie)
  isBestseller?: boolean;
  isOneOff?: boolean;
  soldCount?: number;
  dropEndsAt?: string;
  variants?: ProductVariant[];
};

export default function ProductCard({ product }: { product: Product }) {
  const soldOut = product.stockRemaining !== undefined && product.stockRemaining <= 0;

  return (
    <div
      className={`group relative bg-white border border-line p-3 pb-5 rotate-[-0.6deg] hover:rotate-0 transition-transform ${
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
          One-off
        </span>
      )}

      {/* the "polaroid" frame: white border, image, caption strip underneath */}
      <div className="aspect-square bg-paper flex items-center justify-center overflow-hidden">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-warm-grey text-xs font-mono">photo coming soon</span>
        )}
      </div>

      <div className="pt-3 px-1">
        <p className="font-display text-base leading-tight">{product.name}</p>
        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="font-mono">{product.priceLabel}</span>
          {soldOut ? (
            <span className="font-mono text-xs uppercase text-warm-grey">Sold out</span>
          ) : product.stockRemaining !== undefined && product.stockRemaining <= 10 ? (
            <span className="font-mono text-xs text-accent">
              Only {product.stockRemaining} left
            </span>
          ) : null}
        </div>
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
