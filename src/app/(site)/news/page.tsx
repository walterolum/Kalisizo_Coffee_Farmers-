import type { Metadata } from "next";
import { NewsCard } from "@/frontend/components/ContentCards";
import { EmptyState, PageHero } from "@/frontend/components/PageHero";
import { Reveal } from "@/frontend/components/Reveal";
import { getPublishedNews } from "@/backend/site-content";
import { SITE_URL } from "@/shared/site";

export const metadata: Metadata = {
  title: "News & Stories",
  description:
    "Harvest updates, cooperative announcements and farmer stories from Kalisizo Sub County, Kyotera District.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/news` : undefined },
  openGraph: {
    title: "News & Stories",
    description:
      "Harvest updates, cooperative announcements and farmer stories from Kalisizo.",
    url: SITE_URL ? `${SITE_URL}/news` : undefined,
  },
};

export default async function NewsPage() {
  const articles = await getPublishedNews(24);

  return (
    <>
      <PageHero
        eyebrow="Newsroom"
        title="News & Stories"
        description="Harvest reports, cooperative announcements and stories from the farmers and staff who keep the cooperative running."
      />

      <section className="bg-cream py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {articles.length === 0 ? (
            <EmptyState
              title="No articles yet"
              description="Published news and stories will appear here as soon as the cooperative publishes them."
            />
          ) : (
            <>
              <h2 className="sr-only">All articles</h2>
              <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
                {articles.map((article, i) => (
                  <Reveal key={article.id} as="li" delay={Math.min(i, 5) * 80}>
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
            </>
          )}
        </div>
      </section>
    </>
  );
}
