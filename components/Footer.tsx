export default function Footer() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-6 py-14 grid gap-10 md:grid-cols-3 text-sm">
        <div>
          <span className="font-display text-xl">Art Kade</span>
          <p className="mt-3 text-warm-grey max-w-xs">
            A curated Sri Lankan creative marketplace. Kade means shop.
          </p>
        </div>
        <div>
          <p className="font-medium mb-3 tracking-eyebrow uppercase text-xs text-warm-grey">
            The stalls
          </p>
          <ul className="space-y-2">
            <li><a href="/stalls/vdokade" className="hover:text-accent">Vdokade</a></li>
            <li><a href="/stalls/nuwan-shilpa" className="hover:text-accent">Nuwan Shilpa</a></li>
            <li><a href="/stalls/shilpa-kade" className="hover:text-accent">Shilpa Kade</a></li>
          </ul>
        </div>
        <div>
          <p className="font-medium mb-3 tracking-eyebrow uppercase text-xs text-warm-grey">
            Follow along
          </p>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-accent">Instagram: @vdo_kade</a></li>
            <li><a href="#" className="hover:text-accent">WhatsApp us</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-6 text-center text-xs text-warm-grey">
        © {new Date().getFullYear()} Art Kade. All prints and stickers belong to their artists.
      </div>
    </footer>
  );
}
