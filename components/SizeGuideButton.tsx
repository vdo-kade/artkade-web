"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { DEFAULT_TSHIRT_SIZE_CHART } from "@/lib/sizing";

// Portalled to document.body for the same reason as ExpandableImage's
// lightbox: this can render inside the product modal's own fixed+
// transformed overlay, and a plain nested `fixed` element would position
// against that ancestor instead of the viewport without the portal.
export default function SizeGuideButton({
  customImageUrl,
}: {
  // Per-product override (products.sizing_chart_url) -- when set, shows
  // that vendor-uploaded image instead of the site-wide default table.
  customImageUrl?: string | null;
}) {
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
              className="bg-white max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-display text-lg mb-4 text-center">Sizing chart</p>

              {customImageUrl ? (
                <Image
                  src={customImageUrl}
                  alt="Sizing chart"
                  width={800}
                  height={1000}
                  sizes="384px"
                  className="w-full h-auto"
                />
              ) : (
                <>
                  <p className="text-xs text-warm-grey mb-3 text-center">
                    Measurements in inches
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="text-left font-mono text-xs uppercase tracking-wide text-warm-grey py-1.5">
                          Size
                        </th>
                        <th className="text-right font-mono text-xs uppercase tracking-wide text-warm-grey py-1.5">
                          Width
                        </th>
                        <th className="text-right font-mono text-xs uppercase tracking-wide text-warm-grey py-1.5">
                          Length
                        </th>
                        <th className="text-right font-mono text-xs uppercase tracking-wide text-warm-grey py-1.5">
                          Sleeve
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEFAULT_TSHIRT_SIZE_CHART.map((row) => (
                        <tr key={row.size} className="border-b border-line/60">
                          <td className="py-1.5 font-medium">{row.size}</td>
                          <td className="py-1.5 text-right font-mono text-warm-grey">{row.widthIn}"</td>
                          <td className="py-1.5 text-right font-mono text-warm-grey">{row.lengthIn}"</td>
                          <td className="py-1.5 text-right font-mono text-warm-grey">{row.sleeveIn}"</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-5 block mx-auto text-sm font-medium hover:text-accent transition-colors"
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
