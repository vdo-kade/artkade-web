"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// Trigger + slot only -- the actual sizing chart data/UI is a separate
// task. Portalled to document.body for the same reason as
// ExpandableImage's lightbox: this can render inside the product modal's
// own fixed+transformed overlay, and a plain nested `fixed` element would
// position against that ancestor instead of the viewport without the
// portal.
export default function SizeGuideButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Sizing chart"
        className="shrink-0 w-6 h-6 rounded-full border border-line text-xs font-mono flex items-center justify-center text-warm-grey hover:border-accent hover:text-accent transition-colors"
      >
        ?
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] bg-ink/60 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white max-w-sm w-full p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-display text-lg mb-2">Sizing chart</p>
              <p className="text-sm text-warm-grey mb-5">
                Coming soon -- exact measurements for each size will show here.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm font-medium hover:text-accent transition-colors"
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
