import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NewsCard } from "@/frontend/components/ContentCards";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { getPublishedNews } from "@/backend/site-content";

/**
 * The three most recent articles on the home page, with a link to the full
 * newsroom. Hidden entirely when nothing is published yet.
 */
export async function LatestNews() {
  const articles = await getPublishedNews(3);
  if (articles.length === 0) return null;

  return (
    // bg-leaf rather than bg-cream: Location is bg-cream and sits directly
    // above, so the two were one continuous surface.
    <section className="bg-leaf py-24 sm:py-28" aria-labelledby="latest-news-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="latest-news-heading"
            eyebrow="From the newsroom"
            title="Latest News & Stories"
            description="Updates from the cooperative, the farms and the people behind the harvest."
          />
        </Reveal>

        <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article, i) => (
            <Reveal key={article.id} as="li" delay={i * 90}>
              <NewsCard
                href={`/news/${article.slug}`}
                title={article.title}
                excerpt={article.excerpt}
                imageUrl={article.featuredImageUrl}
                imageAlt={article.imageAlt}
                publishedAt={article.publishedAt}
                category={article.category?.name ?? null}
              />
            </Reveal>
          ))}
        </ul>

        <div className="mt-12 flex justify-center">
          <Link href="/news" className="btn btn-outline btn-lg">
            View all news
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
