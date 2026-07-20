// No icon library is installed in this project (checked package.json --
// no lucide-react or any other icon dependency), so these are hand-drawn
// SVGs matching the minimal stroke style already used for the search icon
// in components/SearchForm.tsx, rather than pulling in a new package for
// half a dozen glyphs. `label` is free-text from artists.socials (jsonb,
// edited directly in Supabase -- see supabase/schema.sql), so matching is
// done by normalized substring/equality against known platform names,
// with a generic globe glyph as the fallback for anything else (e.g. a
// personal "Website" link).
function normalize(label: string): string {
  return label.trim().toLowerCase();
}

export default function SocialIcon({ label }: { label: string }) {
  const norm = normalize(label);

  if (norm === "x" || norm.includes("twitter")) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  if (norm.includes("instagram")) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (norm.includes("facebook")) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
        <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.507 1.492-3.89 3.777-3.89 1.094 0 2.238.196 2.238.196v2.46h-1.26c-1.242 0-1.63.771-1.63 1.562v1.878h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94z" />
      </svg>
    );
  }

  if (norm.includes("tiktok")) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
        <path d="M16.6 5.82c-.83-.9-1.29-2.07-1.29-3.31h-3.02v13.44a3.05 3.05 0 0 1-5.53 1.77 3.05 3.05 0 0 1 3.34-4.79v-3.09a6.08 6.08 0 0 0-5.18 9.4 6.08 6.08 0 0 0 11.4-2.94V9.1a8.9 8.9 0 0 0 5.2 1.66V7.75a5.6 5.6 0 0 1-4.92-1.93z" />
      </svg>
    );
  }

  if (norm.includes("youtube")) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 9l6 3-6 3V9z" fill="currentColor" />
      </svg>
    );
  }

  // Generic fallback (e.g. a personal "Website" link) -- a globe, the
  // standard stand-in for "a link to somewhere on the web."
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a14 14 0 0 1 3.6 9 14 14 0 0 1-3.6 9 14 14 0 0 1-3.6-9A14 14 0 0 1 12 3z" />
    </svg>
  );
}
