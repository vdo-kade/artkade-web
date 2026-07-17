// Shared between the vendor dashboard's Freebies tab and the public
// /freebies page, same pattern as PRODUCT_SELECT/CATEGORY_LABELS in
// lib/catalogue.ts.

export const FREEBIE_CATEGORY_LABELS: Record<string, string> = {
  wallpaper: "Wallpaper",
  ringtone: "Ringtone",
  music: "Music",
  book: "Book",
  other: "Other",
};

export const FREEBIE_CATEGORY_ORDER = Object.keys(FREEBIE_CATEGORY_LABELS);

// wallpaper -> image preview, ringtone/music -> inline audio player,
// book -> PDF cover + open/download, other -> generic download. Driven
// directly by the category field rather than sniffing the uploaded file's
// MIME type, since category already carries that intent (see the vendor
// upload form, which is the only way a freebie's category gets set).
export type FreebiePreviewKind = "image" | "audio" | "pdf" | "generic";

export function previewKindForCategory(category: string): FreebiePreviewKind {
  if (category === "wallpaper") return "image";
  if (category === "ringtone" || category === "music") return "audio";
  if (category === "book") return "pdf";
  return "generic";
}

export const FREEBIE_SELECT = "id, artist_id, title, description, category, file_url, thumbnail_url, created_at";

export type FreebieRow = {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
  thumbnail_url: string | null;
  created_at: string;
};

export type Freebie = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileUrl: string;
  thumbnailUrl: string | null;
};

export function mapFreebie(row: FreebieRow): Freebie {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    fileUrl: row.file_url,
    thumbnailUrl: row.thumbnail_url,
  };
}
