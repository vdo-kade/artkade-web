import { FREEBIE_CATEGORY_LABELS, previewKindForCategory, type Freebie } from "@/lib/freebies";

// No bag/checkout involvement at all here, unlike ProductCard -- every
// freebie is a direct link straight to its file in Storage. Preview style
// is driven by category (see previewKindForCategory): wallpapers show an
// image preview, ringtones/music get an inline <audio> player before the
// download link, books (PDF) open in a new tab rather than force-
// downloading since letting the browser's own PDF viewer handle it is
// usually the better default, and everything else just gets a plain
// download link.
export default function FreebieCard({ freebie }: { freebie: Freebie }) {
  const kind = previewKindForCategory(freebie.category);
  // Wallpapers ARE images, so if no separate thumbnail was uploaded the
  // file itself doubles as its own preview; every other category needs an
  // explicit thumbnail_url or falls back to a plain label.
  const previewImage = freebie.thumbnailUrl ?? (kind === "image" ? freebie.fileUrl : null);

  return (
    <div className="bg-white border border-line p-3 pb-4">
      <div className="bg-paper min-h-[8rem] flex items-center justify-center overflow-hidden">
        {previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewImage} alt={freebie.title} className="block w-full h-auto" />
        ) : (
          <span className="text-warm-grey text-xs font-mono uppercase">
            {kind === "pdf" ? "PDF" : kind === "audio" ? "Audio" : "File"}
          </span>
        )}
      </div>

      <div className="pt-3 px-1">
        <p className="font-mono text-xs uppercase text-accent mb-1">
          {FREEBIE_CATEGORY_LABELS[freebie.category] ?? freebie.category}
        </p>
        <p className="font-display text-base leading-tight mb-1">{freebie.title}</p>
        {freebie.description && <p className="text-sm text-warm-grey mb-3">{freebie.description}</p>}

        {kind === "audio" && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio controls src={freebie.fileUrl} className="w-full mb-3" preload="none" />
        )}

        {kind === "pdf" ? (
          <a
            href={freebie.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-ink text-white px-4 py-2 text-xs font-medium tracking-wide hover:bg-accent transition-colors"
          >
            Open PDF
          </a>
        ) : (
          <a
            href={freebie.fileUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-ink text-white px-4 py-2 text-xs font-medium tracking-wide hover:bg-accent transition-colors"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
