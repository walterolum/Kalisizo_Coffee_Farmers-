import type { Metadata } from "next";
import { CmsContentPage, ABOUT_FALLBACK } from "@/components/CmsContentPage";
import { getPageBySlug } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

/**
 * The cooperative's about page. Served from its own route so the primary
 * navigation link and the sitemap have a stable, hard-coded URL; the copy is
 * still managed in the CMS and falls back to bundled text until staff publish
 * a page with the `about` slug.
 */
export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("about");

  // Bare, because the root layout's title template appends the society name.
  // Leaving the suffix in the fallback would render the name twice.
  const title =
    page?.seoTitle ||
    page?.title ||
    "About Us";
  const description =
    page?.seoDescription ||
    page?.excerpt ||
    ABOUT_FALLBACK.excerpt;
  const url = SITE_URL ? `${SITE_URL}/about` : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description, url },
  };
}

export default function AboutPage() {
  return <CmsContentPage slug="about" fallback={ABOUT_FALLBACK} />;
}
