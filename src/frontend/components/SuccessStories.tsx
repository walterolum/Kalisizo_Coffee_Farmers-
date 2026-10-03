"use client";

import { TrendingUp, Users } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { fetchStories, type ApiStory } from "@/shared/api";
import { useRealtimePoll } from "@/shared/realtime";

const STATIC_STORIES: ApiStory[] = [
  {
    id: "static-1",
    title: "Wages Paid on Time",
    quote: null,
    description:
      "Hundreds of member farmers were paid promptly for their marketable coffee cherries, keeping school fees and household plans on track.",
    metric: "UGX 120M+ paid out",
    imageUrl: null,
    displayOrder: 1,
  },
  {
    id: "static-2",
    title: "Inputs Within Reach",
    quote: null,
    description:
      "DAP, NPK and organic manure delivered to the buying point so members could fertilize at the right time and raise next season's yield.",
    metric: "4+ inputs stocked",
    imageUrl: null,
    displayOrder: 2,
  },
  {
    id: "static-3",
    title: "Men & Women, Growing Together",
    quote: null,
    description:
      "A growing membership of farmers and farmers' groups works hand-in-hand with the cooperative on quality, transparency and shared prosperity.",
    metric: "Dedicated membership",
    imageUrl: null,
    displayOrder: 3,
  },
];

export function SuccessStories() {
  const [stories, setStories] = useState<ApiStory[]>(STATIC_STORIES);

  const load = useCallback(async () => {
    const data = await fetchStories();
    if (!data || data.length === 0) return;
    setStories(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "stories");

  // Fallback images from real cooperative photos in /public/pictures
  const FALLBACK_IMAGES = [
    "/pictures/coffee-harvests.jpg",
    "/pictures/nursery-beds.jpg",
    "/pictures/sacco-meetings.jpg",
    "/pictures/training-sessions.jpg",
    "/pictures/awarding-members-with-certificates.jpg",
  ] as const;

  if (stories.length === 0) return null;

  return (
    <section
      id="success-stories"
      className="surface-dark relative overflow-hidden bg-forest py-28 lg:py-36"
      aria-labelledby="stories-heading"
    >
      {/* Dark, and deliberately so: this sat on bg-leaf directly after
          Leadership, which is also bg-leaf, so the two full-height content
          sections ran together with no seam between them. "Real Impact" also
          earns the strongest surface on the page, and the white story cards
          read far better against the forest background. */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="stories-heading"
            eyebrow="Success Stories"
            title="Real Impact for Our Members"
            description="From prompt payouts to accessible inputs. These are the results our members see season after season."
          />
        </Reveal>

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story, i) => (
            <Reveal key={story.id} delay={i * 80} as="li">
              {/* The photograph carries this card. The frame is a plain
                  surface, and the image is allowed to run to the edges rather
                  than sit inside a rounded, shadowed tile inside a rounded,
                  shadowed card — which is where the nesting was starting to
                  show. */}
              <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-forest/8 transition-all duration-300 hover:-translate-y-1 hover:shadow-card hover:ring-action/35">
                <div className="relative aspect-[4/3] overflow-hidden bg-leaf">
                  {story.imageUrl ? (
                    <Image
                      src={story.imageUrl}
                      alt={story.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      quality={70}
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  ) : (
                    <Image
                      src={FALLBACK_IMAGES[i % FALLBACK_IMAGES.length]}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      quality={65}
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  )}
                  {/* Opaque gold disc, so the 12px metric is legible on any
                      photograph without a shadow. Nothing washes the image. */}
                  {story.metric && (
                    <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-[12px] font-bold text-coffee shadow-card">
                      <TrendingUp className="size-3.5" aria-hidden="true" />
                      {story.metric}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <h3 className="font-display text-xl font-semibold leading-tight text-coffee">
                    {story.title}
                  </h3>
                  {story.quote && (
                    <p className="mt-3 border-l-2 border-gold pl-3 text-sm italic leading-relaxed text-muted">
                      {story.quote}
                    </p>
                  )}
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                    {story.description}
                  </p>
                  <span className="mt-6 flex items-center gap-2 border-t border-coffee/10 pt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                    <Users className="size-3.5 text-forest" aria-hidden="true" />
                    Member outcome
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}