import type { NextConfig } from "next";
import {
  buildContentSecurityPolicy,
  buildRemoteImagePatterns,
  resolveAllowedOrigins,
} from "@/shared/security-policy";

// Resolved, and the reasoning recorded, in `security-policy.ts` so it can be
// tested directly — see the note on `resolveAllowedOrigins` about why `*` is
// safe here today and what would invalidate it.
const { allowOrigin: accessControlAllowOrigin, warning: corsWarning } =
  resolveAllowedOrigins();

if (corsWarning) {
  console.warn(`[next.config] ${corsWarning}`);
}

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
 * Both assembled in `src/backend/security-policy.ts` so they can be tested directly.
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
  //
  // `next start` is NOT an alternative entry point once this is set. Next.js
  // rejects it: "next start does not work with output: standalone
  // configuration". `npm start` therefore runs `scripts/start-standalone.mjs`,
  // which performs the copies the build omits (public/, .next/static/, the
  // Prisma engine) and then execs the generated server.js. An earlier version of
  // this comment claimed `next start` read the same build; it does not, which is
  // why the wrong entry point survived as long as it did.
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