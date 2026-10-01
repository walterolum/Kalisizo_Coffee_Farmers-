import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, User } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { formatDate } from "@/components/ContentCards";
import { getNewsBySlug } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getNewsBySlug(slug);
  if (!article) return { title: "Article not found" };

  const title = article.seoTitle || `${article.title} | Kalisizo Coffee Cooperative`;
  const description = article.seoDescription || article.excerpt;
  const url = SITE_URL ? `${SITE_URL}/news/${article.slug}` : undefined;
  const image = article.featuredImageUrl
    ? SITE_URL
      ? new URL(article.featuredImageUrl, SITE_URL).toString()
      : article.featuredImageUrl
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      authors: article.author?.name ? [article.author.name] : undefined,
      ...(image ? { images: [{ url: image, alt: article.imageAlt || article.title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function NewsArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getNewsBySlug(slug);

  // A draft, archived or deleted article is indistinguishable from one that
  // never existed — that is deliberate, so unpublished URLs cannot be probed.
  if (!article) notFound();

  return (
    <>
      <PageHero
        eyebrow={article.category?.name ?? "News"}
        title={article.title}
        trail={[{ label: "News", href: "/news" }]}
      />

      <article className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-charcoal/55">
            {article.publishedAt && (
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4 text-gold-deep" aria-hidden="true" />
                <time dateTime={article.publishedAt.toISOString()}>
                  {formatDate(article.publishedAt)}
                </time>
              </span>
            )}
            {article.author?.name && (
              <span className="flex items-center gap-2">
                <User className="size-4 text-gold-deep" aria-hidden="true" />
                {article.author.name}
              </span>
            )}
          </div>

          {article.featuredImageUrl && (
            <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-3xl ring-1 ring-charcoal/8">
              <Image
                src={article.featuredImageUrl}
                alt={article.imageAlt || ""}
                fill
                priority
                sizes="(min-width: 768px) 48rem, 100vw"
                quality={70}
                className="object-cover"
              />
            </div>
          )}

          <p className="mt-10 font-display text-lg leading-relaxed text-charcoal/80">
            {article.excerpt}
          </p>

          {/* Article bodies are authored in the CMS as trusted HTML. */}
          <div
            className="prose-article mt-6 text-[1.05rem] leading-[1.75] text-charcoal/80"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />

          {article.tags.length > 0 && (
            <ul className="mt-12 flex flex-wrap gap-2 border-t border-charcoal/10 pt-8">
              {article.tags.map((tag) => (
                <li key={tag.slug}>
                  <span className="inline-flex rounded-full bg-charcoal/6 px-3 py-1 text-[12px] font-semibold text-charcoal/60">
                    #{tag.name}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10">
            <Link
              href="/news"
              className="inline-flex items-center gap-2 text-sm font-bold text-forest underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to all news
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
