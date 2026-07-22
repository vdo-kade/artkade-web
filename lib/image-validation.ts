// Sniffs the real file signature (magic bytes) rather than trusting
// file.type or the filename's extension, both of which are just labels the
// client attaches to the upload and can be set to anything -- a script
// hitting an upload endpoint directly (not through the browser's file
// picker) controls both freely. Originally proven out on
// /api/upload-payment-proof; every other upload path in the app (product
// photos, stall logo/hero, freebie file + thumbnail, magazine hero) now
// goes through the same validateUpload() below rather than each
// reimplementing its own size/type check.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB -- plain image uploads

// Freebies are deliberately not image-only (wallpapers, but also ringtones,
// music, ebooks/zines -- see the freebie_category enum in
// supabase/schema.sql and lib/storage.ts's own comment on uploadValidatedFreebieFile).
// A wider signature allowlist than "must be a photo", but still real
// byte-signature sniffing, not a trust-the-content-type pass. Capped at the
// same 10MB as next.config.js's serverActions.bodySizeLimit -- that's the
// actual ceiling a freebie upload can ever reach in production (Vercel 413s
// anything larger before this check even runs), so there's no point letting
// this constant imply a higher cap the platform won't honor.
export const MAX_FREEBIE_UPLOAD_BYTES = MAX_UPLOAD_BYTES; // 10MB, same as the Server Action body limit

export type FileSignature = { mime: string; ext: string; check: (bytes: Uint8Array) => boolean };

const IMAGE_SIGNATURES: FileSignature[] = [
  {
    mime: "image/jpeg",
    ext: "jpg",
    check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: "png",
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    // GIF87a or GIF89a -- only the 4 bytes shared by both are checked.
    mime: "image/gif",
    ext: "gif",
    check: (b) => b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    // RIFF....WEBP -- bytes 4-7 are a file-length field, not part of the
    // signature, so they're skipped.
    mime: "image/webp",
    ext: "webp",
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

// Covers what the freebie categories actually need (wallpaper/ringtone/
// music/book/other): images, plus the common audio and document/ebook
// container formats. Not exhaustive of every audio/document format that
// exists -- just every one of the ones this app's own category list implies
// -- but it's still a real allowlist of sniffed signatures, not "anything
// goes".
const FREEBIE_FILE_SIGNATURES: FileSignature[] = [
  ...IMAGE_SIGNATURES,
  {
    // %PDF
    mime: "application/pdf",
    ext: "pdf",
    check: (b) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
  {
    // PK\x03\x04 (also covers zip-based container formats like epub/docx)
    mime: "application/zip",
    ext: "zip",
    check: (b) =>
      b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b &&
      (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) &&
      (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08),
  },
  {
    // ID3 tag, or a bare frame sync (0xFFFB/0xFFF3/0xFFF2) for tag-less MP3s.
    mime: "audio/mpeg",
    ext: "mp3",
    check: (b) =>
      (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
      (b.length >= 2 && b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xf2)),
  },
  {
    // RIFF....WAVE
    mime: "audio/wav",
    ext: "wav",
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45,
  },
  {
    mime: "audio/ogg",
    ext: "ogg",
    check: (b) => b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53,
  },
  {
    // MP4/M4A container -- "ftyp" box at byte offset 4.
    mime: "audio/mp4",
    ext: "m4a",
    check: (b) =>
      b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
];

function detectType(bytes: Uint8Array, signatures: FileSignature[]): { mime: string; ext: string } | null {
  for (const sig of signatures) {
    if (sig.check(bytes)) return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

export function detectImageType(bytes: Uint8Array): { mime: string; ext: string } | null {
  return detectType(bytes, IMAGE_SIGNATURES);
}

export function detectFreebieFileType(bytes: Uint8Array): { mime: string; ext: string } | null {
  return detectType(bytes, FREEBIE_FILE_SIGNATURES);
}

export type UploadValidationResult =
  | { ok: true; bytes: Uint8Array; mime: string; ext: string }
  | { ok: false; error: string };

// Shared by every upload path in the app (payment proof, product photos,
// stall logo/hero, freebie file + thumbnail, magazine hero): size-caps
// before ever reading the file into memory, then sniffs the real signature
// rather than trusting file.type. `kind` picks which signature set and
// error copy apply -- "image" for anything that must be a real photo,
// "freebie" for the wider freebie-file allowlist above.
export async function validateUpload(
  file: File,
  kind: "image" | "freebie"
): Promise<UploadValidationResult> {
  const maxBytes = kind === "freebie" ? MAX_FREEBIE_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    return { ok: false, error: `File is too large. Maximum size is ${Math.floor(maxBytes / (1024 * 1024))}MB.` };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = kind === "freebie" ? detectFreebieFileType(bytes) : detectImageType(bytes);
  if (!detected) {
    return {
      ok: false,
      error:
        kind === "freebie"
          ? "File must be a recognized image, PDF, ZIP/EPUB, MP3, WAV, OGG, or M4A file."
          : "File must be a JPEG, PNG, GIF, or WEBP image.",
    };
  }

  return { ok: true, bytes, mime: detected.mime, ext: detected.ext };
}
