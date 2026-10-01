import type { NextConfig } from "next";
import {
  buildContentSecurityPolicy,
  buildRemoteImagePatterns,
} from "./src/lib/security-policy";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Browsers only mirror a single origin (or "*"). For multi-origin setups we
// intentionally serve "*" — the API uses bearer tokens, never cookies, so
// "*" is safe here.
//
// Note for the Supabase Auth migration: this stops being true the moment sessions
// move to cookies, because "*" is not allowed with credentials. Re-evaluate this
// line as part of that change rather than inheriting it.
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

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy and the `next/image` host allowlist.
 *
 * Both assembled in `src/lib/security-policy.ts` so they can be tested directly.
 * This file reads `process.env` at module scope and only exports a Next-shaped
 * object, so asserting on it here meant scraping a child process's stdout, which
 * tests the scraper at least as much as the policy.
 *
 * The site ships no third-party JavaScript: all scripts and styles come from our
 * own origin, images from Cloudinary or the local `/uploads` fallback, and data
 * through same-origin `/api` routes. The only embedded frame is the Google Maps
 * iframe in the contact section; social and map links are plain anchors, which
 * CSP does not restrict.
 *
 * Supabase's origin is opened only when a project is configured, so this change
 * alters nothing until the cutover.
 */
const contentSecurityPolicy = buildContentSecurityPolicy({ isProduction });

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
    // Cloudinary stays regardless of the Supabase state: it is the current upload
    // backend and the rollback path, and dropping it mid-cutover would break every
    // media URL already in the database.
    remotePatterns: buildRemoteImagePatterns(),
  },
  async headers() {
    return [
      { source: "/api/:path*", headers: apiHeaders },
      { source: "/:path*", headers: baseSecurityHeaders },
    ];
  },
};

export default nextConfig;