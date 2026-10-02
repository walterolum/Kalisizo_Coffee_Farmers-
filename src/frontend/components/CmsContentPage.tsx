import { notFound } from "next/navigation";
import Image from "next/image";
import { PageHero } from "@/frontend/components/PageHero";
import { Leadership } from "@/frontend/components/Leadership";
import { SuccessStories } from "@/frontend/components/SuccessStories";
import { getPageBySlug } from "@/backend/site-content";

/**
 * Bundled about copy, used only until a published CMS page with the `about`
 * slug exists. Keeps the primary navigation link working on a fresh install.
 */
export const ABOUT_FALLBACK = {
  title: "About Kalisizo Coffee Cooperative",
  excerpt:
    "A farmer-owned cooperative working together for quality and prosperity in Kalisizo Sub County, Kyotera District.",
  content: [
    "<h2>Who we are</h2>",
    "<p>Kalisizo Coffee Farmers Cooperative Society Ltd brings smallholder coffee farmers together in Kalisizo Sub County, Kyotera District. We buy cherries from our members, process them at our washing stations and market finished coffee on their behalf, so farmers keep more of the value their crop creates.</p>",
    "<h2>What we do</h2>",
    "<p>The cooperative runs programmes across four areas: buying and marketing coffee, supplying quality inputs and equipment, delivering financial services through our SACCO, and building farmer capacity through practical training.</p>",
    "<h2>How we work</h2>",
    "<p>Everything is guided by transparency and respect. Members receive a transparent price for their coffee, transparent weights and payment records, and a voice in how the cooperative is run.</p>",
    "<h2>Our commitment</h2>",
    "<p>We are committed to raising household incomes, improving coffee quality year on year, and ensuring the benefits of the harvest reach the families and communities that produce it.</p>",
  ].join(""),
};

type Props = {
  slug: string;
  /** Shown in the hero pill; defaults to a neutral label. */
  eyebrow?: string;
  /**
   * Copy used when no published page with this slug exists yet.
   *
   * This keeps a primary navigation link from 404ing before the CMS has been
   * populated. Once staff publish a page with the same slug it takes over and
   * the fallback is ignored. Omit it for generic pages, where a missing record
   * should genuinely be a 404.
   */
  fallback?: { title: string; excerpt?: string; content: string };
};

/**
 * Renders a CMS-managed page. The copy lives in the database so staff can edit
 * it without a deployment, and the about page additionally shows the live
 * leadership and impact records beneath the prose.
 */
export async function CmsContentPage({ slug, eyebrow, fallback }: Props) {
  const page = await getPageBySlug(slug);

  // An unpublished page is treated as if it does not exist, so drafts can never
  // be reached by guessing a URL.
  if (!page && !fallback) notFound();

  const title = page?.title ?? fallback!.title;
  const excerpt = page?.excerpt ?? fallback?.excerpt ?? null;
  const content = page?.content ?? fallback!.content;
  const imageUrl = page?.imageUrl ?? null;
  const imageAlt = page?.imageAlt ?? null;

  const isAbout = slug === "about";

  return (
    <>
      <PageHero
        eyebrow={eyebrow ?? (isAbout ? "Who we are" : "Information")}
        title={title}
        description={excerpt ?? undefined}
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {imageUrl && (
            <div className="relative mb-12 aspect-[21/9] w-full overflow-hidden rounded-3xl ring-1 ring-charcoal/8">
              <Image
                src={imageUrl}
                alt={imageAlt || title}
                fill
                sizes="(min-width: 768px) 48rem, 100vw"
                quality={65}
                className="object-cover"
              />
            </div>
          )}

          <div
            className="prose-article text-[1.05rem] leading-[1.75] text-charcoal/80"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </section>

      {isAbout && (
        <>
          <Leadership />
          <SuccessStories />
        </>
      )}
    </>
  );
}
