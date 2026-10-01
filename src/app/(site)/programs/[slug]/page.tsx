import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { getProgramBySlug } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  if (!program) return { title: "Program not found" };

  const description = program.summary || program.tagline;
  return {
    title: `${program.title} | Kalisizo Coffee Cooperative`,
    description,
    alternates: {
      canonical: SITE_URL ? `${SITE_URL}/programs/${program.slug}` : undefined,
    },
    openGraph: {
      title: program.title,
      description,
      url: SITE_URL ? `${SITE_URL}/programs/${program.slug}` : undefined,
    },
  };
}

export default async function ProgramDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  if (!program) notFound();

  return (
    <>
      <PageHero
        eyebrow="Program"
        title={program.title}
        description={program.tagline}
        trail={[{ label: "Programs", href: "/programs" }]}
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {program.imageUrl && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl ring-1 ring-charcoal/8">
              <Image
                src={program.imageUrl}
                alt={program.imageAlt || ""}
                fill
                priority
                sizes="(min-width: 768px) 48rem, 100vw"
                quality={65}
                className="object-cover"
              />
            </div>
          )}

          {program.content && (
            <div
              className="prose-article mt-10 text-[1.05rem] leading-[1.75] text-charcoal/80"
              dangerouslySetInnerHTML={{ __html: program.content }}
            />
          )}

          {program.points.length > 0 && (
            <div className="mt-12">
              <h2 className="font-display text-xl font-semibold text-forest">
                What members receive
              </h2>
              <ul className="mt-5 space-y-3">
                {program.points.map((point) => (
                  <li key={point} className="flex gap-3 text-charcoal/75">
                    <Check
                      className="mt-0.5 size-5 shrink-0 text-emerald-brand"
                      aria-hidden="true"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {program.details.length > 0 && (
            <div className="mt-12">
              <h2 className="font-display text-xl font-semibold text-forest">How it works</h2>
              <ul className="mt-5 space-y-3">
                {program.details.map((detail) => (
                  <li
                    key={detail}
                    className="rounded-2xl bg-white px-5 py-4 text-charcoal/75 ring-1 ring-charcoal/8"
                  >
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-12 border-t border-charcoal/10 pt-8">
            <Link
              href="/programs"
              className="inline-flex items-center gap-2 text-sm font-bold text-forest underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All programs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
