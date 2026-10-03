import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { EmptyState, PageHero } from "@/frontend/components/PageHero";
import { Reveal } from "@/frontend/components/Reveal";
import { formatBytes, formatDate } from "@/frontend/components/ContentCards";
import { getPublishedPublications } from "@/backend/site-content";
import { SITE_URL } from "@/shared/site";

export const metadata: Metadata = {
  title: "Publications & Downloads",
  description:
    "Annual reports, brochures, membership forms and policy documents from the Kalisizo Coffee Cooperative.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/publications` : undefined },
};

const KIND_LABEL: Record<string, string> = {
  REPORT: "Report",
  BROCHURE: "Brochure",
  FORM: "Form",
  POLICY: "Policy",
  OTHER: "Document",
};

export default async function PublicationsPage() {
  const publications = await getPublishedPublications(100);

  return (
    <>
      <PageHero
        eyebrow="Documents"
        title="Publications & Downloads"
        description="Reports, forms and reference material for members, partners and the public."
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {publications.length === 0 ? (
            <EmptyState
              title="No documents published"
              description="Reports and forms will be listed here as soon as they are uploaded and published."
            />
          ) : (
            <>
              <h2 className="sr-only">Available documents</h2>
              <ul className="grid gap-4">
                {publications.map((doc, i) => (
                  <Reveal key={doc.id} as="li" delay={Math.min(i, 6) * 50}>
                    <article className="group flex flex-col gap-4 bg-white p-5 ring-1 ring-coffee/8 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card hover:ring-action/35 sm:flex-row sm:items-center sm:gap-6">
                      {/* Offset colour block behind the icon tile: the tile reads as a
                          foreground object rather than a floating glyph. */}
                      <span className="relative shrink-0" aria-hidden="true">
                        <span className="absolute inset-y-1 -left-1.5 w-12 rounded-xl bg-gold/25" />
                        <span className="relative flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-forest to-forest-deep text-gold-light">
                          <FileText className="size-6" />
                        </span>
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex w-fit items-center rounded-full bg-brand/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-forest">
                            {KIND_LABEL[doc.kind] ?? "Document"}
                          </span>
                          {doc.publishedAt && (
                            <time
                              dateTime={doc.publishedAt.toISOString()}
                              className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
                            >
                              {formatDate(doc.publishedAt)}
                            </time>
                          )}
                        </div>
                        <h2 className="mt-2 font-display text-base font-semibold leading-snug text-coffee">
                          {doc.title}
                        </h2>
                        {doc.summary && (
                          <p className="mt-2 text-sm leading-relaxed text-muted">
                            {doc.summary}
                          </p>
                        )}
                        <p className="mt-2 text-[12px] text-muted">
                          {doc.fileName}
                          {doc.fileSizeBytes > 0 && ` · ${formatBytes(doc.fileSizeBytes)}`}
                        </p>
                      </div>

                      <a
                        href={doc.fileUrl}
                        download
                        className="btn btn-green btn-md shrink-0"
                      >
                        <Download className="size-4" aria-hidden="true" />
                        Download
                        <span className="sr-only">{doc.title}</span>
                      </a>
                    </article>
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
