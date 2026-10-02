import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Ticket, UserRound } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { formatDateTime } from "@/components/ContentCards";
import { getEventBySlug, isPastEvent } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { title: "Event not found" };

  const description = event.summary;
  return {
    title: event.title,
    description,
    alternates: {
      canonical: SITE_URL ? `${SITE_URL}/events/${event.slug}` : undefined,
    },
    openGraph: { title: event.title, description, type: "article" },
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  return (
    <>
      <PageHero
        eyebrow={isPastEvent(event.startAt) ? "Past event" : "Upcoming event"}
        title={event.title}
        description={event.summary}
        trail={[{ label: "Events", href: "/events" }]}
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {event.imageUrl && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl ring-1 ring-charcoal/8">
              <Image
                src={event.imageUrl}
                alt={event.imageAlt || event.title}
                fill
                priority
                sizes="(min-width: 768px) 48rem, 100vw"
                quality={65}
                className="object-cover"
              />
            </div>
          )}

          <dl className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-charcoal/8">
              <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-deep">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                When
              </dt>
              <dd className="mt-2 text-charcoal/80">
                <time dateTime={event.startAt.toISOString()}>
                  {formatDateTime(event.startAt)}
                </time>
                {event.endAt && (
                  <>
                    {" to "}
                    <time dateTime={event.endAt.toISOString()}>
                      {formatDateTime(event.endAt)}
                    </time>
                  </>
                )}
              </dd>
            </div>
            {event.location && (
              <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-charcoal/8">
                <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-deep">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  Where
                </dt>
                <dd className="mt-2 text-charcoal/80">{event.location}</dd>
              </div>
            )}
            {event.organizer && (
              <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-charcoal/8">
                <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-deep">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  Organiser
                </dt>
                <dd className="mt-2 text-charcoal/80">{event.organizer}</dd>
              </div>
            )}
            {event.registrationInfo && (
              <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-charcoal/8">
                <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-deep">
                  <Ticket className="size-3.5" aria-hidden="true" />
                  Registration
                </dt>
                <dd className="mt-2 text-charcoal/80">{event.registrationInfo}</dd>
              </div>
            )}
          </dl>

          {event.description && (
            <div
              className="prose-article mt-12 text-[1.05rem] leading-[1.75] text-charcoal/80"
              dangerouslySetInnerHTML={{ __html: event.description }}
            />
          )}

          <div className="mt-12 border-t border-charcoal/10 pt-8">
            <Link
              href="/events"
              className="inline-flex items-center gap-2 text-sm font-bold text-forest underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All events
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
