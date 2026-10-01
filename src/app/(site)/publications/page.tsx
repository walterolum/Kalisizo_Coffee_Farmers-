import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { EmptyState, PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { formatBytes, formatDate } from "@/components/ContentCards";
import { getPublishedPublications } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

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
                    <article className="group flex flex-col gap-4 bg-white p-5 ring-1 ring-charcoal/8 transition-colors duration-300 hover:ring-gold/40 sm:flex-row sm:items-center sm:gap-6">
                      <span
                        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-forest text-gold-light"
                        aria-hidden="true"
                      >
                        <FileText className="size-6" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-deep">
                          <span>{KIND_LABEL[doc.kind] ?? "Document"}</span>
                          {doc.publishedAt && (
                            <time
                              dateTime={doc.publishedAt.toISOString()}
                              className="text-charcoal/40"
                            >
                              {formatDate(doc.publishedAt)}
                            </time>
                          )}
                        </div>
                        <h2 className="mt-2 font-display text-base font-semibold leading-snug text-forest">
                          {doc.title}
                        </h2>
                        {doc.summary && (
                          <p className="mt-2 text-sm leading-relaxed text-charcoal/65">
                            {doc.summary}
                          </p>
                        )}
                        <p className="mt-2 text-[12px] text-charcoal/40">
                          {doc.fileName}
                          {doc.fileSizeBytes > 0 && ` · ${formatBytes(doc.fileSizeBytes)}`}
                        </p>
                      </div>

                      <a
                        href={doc.fileUrl}
                        download
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-bold text-cream transition-colors hover:bg-forest-deep"
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
