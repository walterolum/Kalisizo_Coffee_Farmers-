import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { AdminClient } from "./AdminClient";

export const metadata: Metadata = {
  title: "Admin | Kalisizo Coffee Farmers Cooperative",
  robots: { index: false, follow: false },
};

/**
 * The dashboard reads the selected panel from the `?section=` query parameter so
 * that any panel is linkable and the browser's back button works. `useSearchParams`
 * requires a Suspense boundary on a prerendered route, so the client is wrapped
 * here rather than in `AdminClient`, keeping the component itself unaware of it.
 */
export default function AdminPage() {
  return (
    <Suspense fallback={<AdminShellFallback />}>
      <AdminClient />
    </Suspense>
  );
}

function AdminShellFallback() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-forest-deep text-cream"
      role="status"
      aria-label="Loading admin"
    >
      <Loader2 className="size-7 animate-spin text-gold" aria-hidden="true" />
      <span className="sr-only">Loading the admin dashboard…</span>
    </div>
  );
}