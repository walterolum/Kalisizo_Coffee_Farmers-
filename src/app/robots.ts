import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    // Both fields are omitted rather than emitted empty when
    // `NEXT_PUBLIC_SITE_URL` is unset. A bare `Host:` line is not merely
    // redundant — some crawlers treat a `Host` directive that does not match
    // the served origin as an instruction to index a different site, which is
    // worse than saying nothing. Previously `host` was always emitted, so a
    // missing env var produced `Host:` with no value.
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL } : {}),
  };
}