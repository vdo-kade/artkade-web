import Link from "next/link";
import Countdown from "./Countdown";

export type Stall = {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  isPopup?: boolean;
  popupEndsAt?: string;
};

export default function StallCard({ stall }: { stall: Stall }) {
  return (
    <Link
      href={`/stalls/${stall.slug}`}
      className="group block bg-white border border-line p-6 transition-shadow hover:shadow-[6px_6px_0_rgba(28,23,18,0.08)]"
    >
      <div
        className="h-2 w-10 mb-5"
        style={{ backgroundColor: stall.accentColor }}
        aria-hidden
      />
      <h3 className="font-display text-2xl mb-2">{stall.name}</h3>
      <p className="text-sm text-warm-grey mb-4">{stall.tagline}</p>
      {stall.isPopup && stall.popupEndsAt && (
        <p className="mb-3 text-accent">
          Pop-up stall · <Countdown endsAt={stall.popupEndsAt} />
        </p>
      )}
      <span className="text-sm font-medium group-hover:text-accent">
        Enter the stall →
      </span>
    </Link>
  );
}
