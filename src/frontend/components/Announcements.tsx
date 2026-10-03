import Link from "next/link";
import { AlertTriangle, Info, Megaphone } from "lucide-react";
import { getActiveAnnouncements } from "@/backend/site-content";

const SEVERITY_STYLES: Record<string, { wrap: string; icon: typeof Info }> = {
  INFO: { wrap: "bg-white/8 text-cream ring-white/15", icon: Info },
  WARNING: { wrap: "bg-gold/15 text-gold-light ring-gold/30", icon: AlertTriangle },
  CRITICAL: { wrap: "bg-cherry/15 text-cherry-light ring-cherry/30", icon: AlertTriangle },
};

/**
 * Renders any announcements that are published and inside their date window.
 * Returns nothing at all when there are none, so the home page keeps its
 * original rhythm for the common case.
 */
export async function Announcements() {
  const notices = await getActiveAnnouncements();
  if (notices.length === 0) return null;

  return (
    <section aria-labelledby="announcements-heading" className="surface-dark bg-forest-deep py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="announcements-heading" className="sr-only">
          Announcements
        </h2>
        <ul className="grid gap-3">
          {notices.map((notice) => {
            const style = SEVERITY_STYLES[notice.severity] ?? SEVERITY_STYLES.INFO;
            const Icon = style.icon;
            return (
              <li
                key={notice.id}
                className={`flex flex-col gap-3 rounded-2xl px-5 py-4 ring-1 sm:flex-row sm:items-center ${style.wrap}`}
              >
                <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
                  <Icon className="size-4" aria-hidden="true" />
                  {notice.severity === "CRITICAL" ? "Important notice" : "Notice"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-cream">{notice.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-cream/75">
                    {notice.body}
                  </p>
                </div>
                {notice.linkUrl && (
                  <Link
                    href={notice.linkUrl}
                    className="inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-bold text-gold-light underline-offset-4 hover:underline sm:self-auto"
                  >
                    <Megaphone className="size-4" aria-hidden="true" />
                    {notice.linkLabel || "Read more"}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
