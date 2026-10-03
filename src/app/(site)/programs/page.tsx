import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PageHero, EmptyState } from "@/frontend/components/PageHero";
import { Reveal } from "@/frontend/components/Reveal";
import { getPublishedPrograms } from "@/backend/site-content";
import { SITE_URL } from "@/shared/site";

export const metadata: Metadata = {
  title: "Our Programs",
  description:
    "Coffee trade, production inputs, SACCO financial services and capacity building: the services the Kalisizo cooperative provides to its members.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/programs` : undefined },
};

export default async function ProgramsPage() {
  const programs = await getPublishedPrograms();

  return (
    <>
      <PageHero
        eyebrow="What we do"
        title="Programs & Services"
        description="Everything the cooperative runs for its members: from buying and marketing coffee to inputs, savings and hands-on training."
      />

      <section className="bg-leaf py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {programs.length === 0 ? (
            <EmptyState
              title="No programs published"
              description="Program information will appear here once it is published in the CMS."
            />
          ) : (
            <ul className="grid gap-7 md:grid-cols-2">
              {programs.map((program, i) => (
                <Reveal key={program.id} as="li" delay={Math.min(i, 4) * 80}>
                  <article className="group relative flex h-full flex-col overflow-hidden bg-white ring-1 ring-coffee/8 transition-all duration-300 hover:-translate-y-1 hover:shadow-card hover:ring-action/35">
                    {program.imageUrl && (
                      <div className="relative aspect-[16/9] overflow-hidden bg-leaf">
                        <Image
                          src={program.imageUrl}
                          alt={program.title}
                          fill
                          sizes="(min-width: 768px) 50vw, 100vw"
                          quality={65}
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-7 sm:p-8">
                      <h2 className="font-display text-xl font-semibold text-coffee">
                        {program.title}
                      </h2>
                      <p className="mt-2 inline-flex w-fit rounded-full bg-gold/20 px-3 py-1 text-sm font-semibold text-coffee">
                        {program.tagline}
                      </p>
                      {program.points.length > 0 && (
                        <ul className="mt-5 flex-1 space-y-2.5">
                          {program.points.map((point) => (
                            <li key={point} className="flex gap-2.5 text-sm text-muted">
                              <Check
                                className="mt-0.5 size-4 shrink-0 text-forest"
                                aria-hidden="true"
                              />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-forest transition-colors group-hover:text-action">
                        Learn more
                        <ArrowRight
                          className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                    <Link
                      href={`/programs/${program.slug}`}
                      className="absolute inset-0 z-10"
                      aria-label={`Learn more about ${program.title}`}
                    >
                      <span className="sr-only">Learn more about {program.title}</span>
                    </Link>
                  </article>
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
