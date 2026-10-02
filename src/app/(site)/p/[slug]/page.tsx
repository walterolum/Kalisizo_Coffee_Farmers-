import type { Metadata } from "next";
import { CmsContentPage } from "@/components/CmsContentPage";
import { getPageBySlug } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

/** Generic route for any CMS page that does not have a dedicated page. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return { title: "Page not found" };

  // Bare: the root layout's title template appends the society name.
  const title = page.seoTitle || page.title;
  const description = page.seoDescription || page.excerpt || undefined;
  const url = SITE_URL ? `${SITE_URL}/p/${page.slug}` : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description, url },
  };
}

export default async function GenericCmsPage({ params }: PageProps) {
  const { slug } = await params;
  return <CmsContentPage slug={slug} />;
}
