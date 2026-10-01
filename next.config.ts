import type { NextConfig } from "next";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Browsers only mirror a single origin (or "*"). For multi-origin setups we
// intentionally serve "*" — the API uses bearer tokens, never cookies, so
// "*" is safe here.
const accessControlAllowOrigin = allowedOrigins.length === 1 ? allowedOrigins[0] : "*";

const apiHeaders = [
  { key: "Access-Control-Allow-Origin", value: accessControlAllowOrigin },
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,PUT,DELETE,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
  { key: "Access-Control-Max-Age", value: "86400" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * Content Security Policy.
 *
 * The site ships no third-party JavaScript: all scripts and styles are served
 * from our own origin, images come from Cloudinary or the local `/uploads`
 * fallback, and data flows through same-origin `/api` routes and the realtime
 * SSE stream. The only embedded frame is the Google Maps iframe in the contact
 * section, and social/map links are plain anchors that CSP does not restrict.
 *
 * `'unsafe-inline'` is retained for `script-src` and `style-src` because Next.js
 * emits inline hydration scripts and the design system uses inline style
 * attributes. Removing them requires a per-request nonce threaded through the
 * router, which is a larger change; `object-src 'none'` and `base-uri 'self'`
 * still block the main injection vectors.
 */
const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // `unsafe-eval` is required by the dev server's hot-reload runtime only.
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  // Cloudinary serves transformed image variants from res.cloudinary.com.
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Same-origin API and the /api/v1/realtime/stream EventSource.
  "connect-src 'self'",
  "frame-src https://www.google.com https://maps.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Emit `.next/standalone`, a self-contained server bundle with only the
  // node_modules actually reached at build time. The Docker runtime stage copies
  // this instead of `node_modules`, which is what keeps the final image small.
  // A file/CLI deployment is unaffected: `next start` reads the same build.
  output: "standalone",
  images: {
    // Allow the arbitrary quality values used by <Image> across the site.
    qualities: [50, 65, 70],
    // Cloudinary is the configured upload backend when CLOUDINARY_* env vars are set.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
  async headers() {
    return [
      { source: "/api/:path*", headers: apiHeaders },
      { source: "/:path*", headers: baseSecurityHeaders },
    ];
  },
};

export default nextConfig;