// Light anti-copy friction for catalogue art (product cards, detail-page
// gallery/lightbox) -- these are prints being sold, not given away, unlike
// freebies (wallpapers/ringtones/PDFs), which must never get this. This is
// friction, not protection: it stops a casual right-click-save, drag-out, or
// mobile long-press save. It does nothing against devtools, view-source, the
// network tab, or a screenshot -- none of those can be blocked on the web.
export const NO_COPY_IMAGE_CLASS = "select-none [-webkit-touch-callout:none]";

export function preventImageCopy(e: { preventDefault: () => void }) {
  e.preventDefault();
}
