// Sniffs the real file signature (magic bytes) rather than trusting
// file.type or the filename's extension, both of which are just labels the
// client attaches to the upload and can be set to anything -- a script
// hitting /api/upload-payment-proof directly (not through the browser file
// picker) controls both freely.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

type ImageSignature = { mime: string; ext: string; check: (bytes: Uint8Array) => boolean };

const SIGNATURES: ImageSignature[] = [
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

export function detectImageType(bytes: Uint8Array): { mime: string; ext: string } | null {
  for (const sig of SIGNATURES) {
    if (sig.check(bytes)) return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}
