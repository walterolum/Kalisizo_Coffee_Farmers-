import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarRange, MapPin, Users } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { formatDate, formatStage } from "@/components/ContentCards";
import { getProjectBySlug } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: "Project not found" };

  const description = project.seoDescription || project.summary;
  const url = SITE_URL ? `${SITE_URL}/projects/${project.slug}` : undefined;
  return {
    title: `${project.seoTitle || project.title} | Kalisizo Coffee Cooperative`,
    description,
    alternates: { canonical: url },
    openGraph: { title: project.title, description, url, type: "article" },
  };
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const dateRange =
    project.startDate && project.endDate
      ? `${formatDate(project.startDate)} to ${formatDate(project.endDate)}`
      : project.startDate
        ? `From ${formatDate(project.startDate)}`
        : null;

  return (
    <>
      <PageHero
        eyebrow={formatStage(project.stage)}
        title={project.title}
        description={project.summary}
        trail={[{ label: "Projects", href: "/projects" }]}
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {project.imageUrl && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl ring-1 ring-charcoal/8">
              <Image
                src={project.imageUrl}
                alt={project.imageAlt || ""}
                fill
                priority
                sizes="(min-width: 768px) 48rem, 100vw"
                quality={65}
                className="object-cover"
              />
            </div>
          )}

          <dl className="mt-10 grid gap-4 sm:grid-cols-2">
            {project.location && (
              <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-charcoal/8">
                <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-deep">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  Location
                </dt>
                <dd className="mt-2 text-charcoal/80">{project.location}</dd>
              </div>
            )}
            {dateRange && (
              <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-charcoal/8">
                <dt className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-deep">
                  <CalendarRange className="size-3.5" aria-hidden="true" />
                  Timeline
                </dt>
                <dd className="mt-2 text-charcoal/80">{dateRange}</dd>
              </div>
            )}
          </dl>

          {project.description && (
            <div
              className="prose-article mt-12 text-[1.05rem] leading-[1.75] text-charcoal/80"
              dangerouslySetInnerHTML={{ __html: project.description }}
            />
          )}

          {project.impact && (
            <div className="mt-12 rounded-3xl bg-forest-deep p-7 text-cream sm:p-9">
              <h2 className="font-display text-xl font-semibold text-gold-light">
                Our impact
              </h2>
              <p className="mt-3 leading-relaxed text-cream/80">{project.impact}</p>
            </div>
          )}

          {project.partners.length > 0 && (
            <div className="mt-12">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-forest">
                <Users className="size-5 text-gold-deep" aria-hidden="true" />
                Partners
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {project.partners.map((partner) => (
                  <li
                    key={partner}
                    className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-charcoal/70 ring-1 ring-charcoal/8"
                  >
                    {partner}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {project.images.length > 0 && (
            <div className="mt-12">
              <h2 className="font-display text-xl font-semibold text-forest">Gallery</h2>
              <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {project.images.map((image) => (
                  <li key={image.id}>
                    <div className="relative aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-charcoal/8">
                      <Image
                        src={image.thumbnailUrl || image.url}
                        alt={image.alt}
                        fill
                        sizes="(min-width: 640px) 16rem, 33vw"
                        quality={50}
                        className="object-cover"
                      />
                    </div>
                    {image.caption && (
                      <p className="mt-2 text-[13px] text-charcoal/55">{image.caption}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-12 border-t border-charcoal/10 pt-8">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 text-sm font-bold text-forest underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              All projects
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
