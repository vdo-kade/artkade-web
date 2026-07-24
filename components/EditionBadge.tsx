// Generalized, per-variant sibling of the "1 of 1" badge -- same visual
// language (accent-filled, uppercase, mono, small), but driven by a live
// stock/editionSize fraction instead of a fixed "1 of 1" label. Stock
// already decrements on every sale (see lib/stock.ts), so this is just
// that same number read against a fixed denominator, not a separate
// counter -- a test purchase moves this badge for free.
export default function EditionBadge({
  stock,
  editionSize,
  className = "",
}: {
  stock: number;
  editionSize: number;
  className?: string;
}) {
  return (
    <span
      className={`bg-accent text-white text-[10px] font-mono uppercase tracking-wide px-2 py-1 whitespace-nowrap ${className}`}
    >
      {stock > 0 ? `${stock} of ${editionSize} left` : "Sold, won't return"}
    </span>
  );
}
