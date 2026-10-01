import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BackToTop } from "@/components/BackToTop";

/**
 * Shell for every public page.
 *
 * The `(site)` route group keeps these pages at their normal URLs (`/`, `/news`,
 * …) while letting them share the header, footer and back-to-top control, so the
 * CMS admin at `/admin` — which renders its own full-screen chrome — is
 * unaffected.
 */

/**
 * Public pages read live data from the database through React Server
 * Components, and Prisma calls are invisible to Next's static analysis. Without
 * this, list pages such as `/` and `/news` would be prerendered at build time
 * and keep serving an empty result until the site was redeployed after every
 * publish.
 *
 * Declaring it once here covers the whole group — including pages added later —
 * and matches the public API routes, which are already rendered per request.
 */
export const dynamic = "force-dynamic";

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <BackToTop />
    </>
  );
}
