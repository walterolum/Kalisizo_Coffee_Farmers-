/**
 * Image type detection based on file contents.
 *
 * The `Content-Type` on a multipart upload is supplied by the client and is
 * trivially spoofable, so it cannot be trusted to decide whether a file is an
 * image. An attacker could otherwise upload an HTML or SVG payload labelled as
 * `image/png` and have it served from our own origin.
 *
 * These checks read the magic-number header of the file instead, and the upload
 * route requires the sniffed type to match the declared one.
 */

export type ImageKind = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean => {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
};

export function sniffImageType(buffer: Buffer): ImageKind | null {
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return "image/gif";

  // WebP: "RIFF" .... "WEBP" (the four bytes at offset 8 are the chunk size)
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  return null;
}
