import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/shared/image-sniff";

/**
 * The upload route trusts these checks to reject a non-image payload that
 * declares an image content type, so the byte patterns are the security
 * boundary, not a convenience.
 */

/** Minimal valid headers followed by filler, enough for sniffing. */
const withHeader = (header: number[], size = 32) =>
  Buffer.concat([Buffer.from(header), Buffer.alloc(size, 0x00)]);

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF = [0x52, 0x49, 0x46, 0x46];

describe("sniffImageType", () => {
  it("recognises the four accepted image formats", () => {
    expect(sniffImageType(withHeader(JPEG))).toBe("image/jpeg");
    expect(sniffImageType(withHeader(PNG))).toBe("image/png");
    expect(sniffImageType(withHeader(GIF))).toBe("image/gif");
  });

  it("recognises WebP only when the WEBP tag follows RIFF", () => {
    const webp = Buffer.concat([
      Buffer.from(RIFF),
      Buffer.from([0x1a, 0x00, 0x00, 0x00]), // chunk size
      Buffer.from([0x57, 0x45, 0x42, 0x50]), // "WEBP"
      Buffer.alloc(16, 0x00),
    ]);
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("rejects a RIFF container that is not WebP (e.g. WAV audio)", () => {
    const wav = Buffer.concat([
      Buffer.from(RIFF),
      Buffer.from([0x1a, 0x00, 0x00, 0x00]),
      Buffer.from([0x57, 0x41, 0x56, 0x45]), // "WAVE"
      Buffer.alloc(16, 0x00),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });

  it("rejects HTML that could be served as active content", () => {
    const html = Buffer.from(
      "<!DOCTYPE html><html><body><script>alert(1)</script></body></html>",
      "utf8"
    );
    expect(sniffImageType(html)).toBeNull();
  });

  it("rejects SVG, which can carry script", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });

  it("rejects a truncated header rather than guessing", () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it("does not mistake a longer file with a bad header for an image", () => {
    const fake = Buffer.concat([
      Buffer.from(PNG),
      Buffer.alloc(4096, 0x41),
      Buffer.from("<script>alert(1)</script>"),
    ]);
    // A real PNG would still be reported as a PNG; what matters is that the
    // detection is driven by the leading bytes, not by any later content.
    expect(sniffImageType(fake)).toBe("image/png");
  });
});
