import type { Metadata } from "next";
import { Contact } from "@/components/Contact";
import { Faq } from "@/components/Faq";
import { Location } from "@/components/Location";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact the Kalisizo Coffee Farmers Cooperative Society Ltd office in Kalisizo Sub County, Kyotera District: phone, email, map and enquiry form.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/contact` : undefined },
};

/**
 * Contact page. Reuses the same components as the home page so the office
 * details, map, FAQ and enquiry form stay in one place and pick up CMS edits.
 */
export default function ContactPage() {
  return (
    <>
      {/* `headingLevel` is 1 here but 2 on the home page: this page has no hero,
          so the contact section is its main heading. Rendered as `h2` everywhere
          the component is used, this page shipped with no `h1` at all.

          This component must appear exactly once. It emits fixed DOM ids
          (`name`, `email`, `phone`, `type`, `message`, `inquiry`, ...), so a
          second copy makes every `label[for]` resolve to the first copy's field,
          duplicates the enquiry form and the Google Maps iframe, and leaves
          keyboard focus jumping between two identical forms. */}
      <Contact headingLevel={1} />
      <Location />
      <Faq />
    </>
  );
}
