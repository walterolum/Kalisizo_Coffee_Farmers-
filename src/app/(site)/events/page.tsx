import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/frontend/components/ContentCards";
import { EmptyState, PageHero } from "@/frontend/components/PageHero";
import { Reveal } from "@/frontend/components/Reveal";
import { getEventsByTiming } from "@/backend/site-content";
import { SITE_URL } from "@/shared/site";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Training sessions, community meetings and agricultural events run by the Kalisizo Coffee Cooperative.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/events` : undefined },
};

type PageProps = { searchParams: Promise<{ view?: string }> };

export default async function EventsPage({ searchParams }: PageProps) {
  const { view } = await searchParams;
  const showPast = view === "past";

  const { upcoming, past } = await getEventsByTiming(100);
  const visible = showPast ? past : upcoming;

  return (
    <>
      <PageHero
        eyebrow="What's on"
        title="Events"
        description="Training, meetings and community gatherings. All members and the wider community are welcome."
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Choose event listing" className="mb-10 flex flex-wrap gap-2">
            {[
              { value: "", label: `Upcoming (${upcoming.length})` },
              { value: "past", label: `Past (${past.length})` },
            ].map((option) => {
              const isActive = option.value === (showPast ? "past" : "");
              return (
                <Link
                  key={option.label}
                  href={option.value ? `/events?view=${option.value}` : "/events"}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-forest text-cream"
                      : "bg-white text-muted ring-1 ring-coffee/10 hover:bg-leaf"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>

          {visible.length === 0 ? (
            <EmptyState
              title={showPast ? "No past events" : "No upcoming events"}
              description={
                showPast
                  ? "Completed events will be archived here."
                  : "Nothing is scheduled at the moment. Check back soon or contact the cooperative office."
              }
            >
              <Link href="/contact" className="btn btn-outline">
                Contact the office
              </Link>
            </EmptyState>
          ) : (
            <ul className="grid gap-5">
              {visible.map((event, i) => (
                <Reveal key={event.id} as="li" delay={Math.min(i, 5) * 60}>
                  <EventCard
                    href={`/events/${event.slug}`}
                    title={event.title}
                    summary={event.summary}
                    startAt={event.startAt}
                    location={event.location}
                    isPast={showPast}
                  />
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
