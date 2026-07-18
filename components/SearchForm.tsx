// Plain GET form -- works with zero client JS (no "use client" needed):
// submitting navigates to /search?q=... the same way clicking a link would,
// and app/search/page.tsx does the actual matching server-side.
export default function SearchForm({
  id = "site-search",
  defaultValue = "",
  className,
  inputClassName,
}: {
  id?: string;
  defaultValue?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <form action="/search" method="GET" role="search" className={className}>
      <label htmlFor={id} className="sr-only">
        Search products and stalls
      </label>
      <div className="relative">
        <input
          id={id}
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Search products, stalls..."
          className={
            inputClassName ??
            "w-full border border-line bg-white px-3 py-2 pr-9 text-sm focus:outline-none focus:border-accent"
          }
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-warm-grey hover:text-accent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
