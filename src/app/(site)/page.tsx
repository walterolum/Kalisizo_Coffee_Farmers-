import { Hero, TodayAtCoop } from "@/frontend/components/Hero";
import { Marquee } from "@/frontend/components/Marquee";
import { Announcements } from "@/frontend/components/Announcements";
import { Reveal } from "@/frontend/components/Reveal";
import {
  ClosingCta,
  ImageStatement,
  Impact,
  Journey,
  StorySplit,
} from "@/frontend/components/Narrative";
import { MissionVision } from "@/frontend/components/MissionVision";
import { Services } from "@/frontend/components/Services";
import { Products } from "@/frontend/components/Products";
import { Gallery } from "@/frontend/components/Gallery";
import { Leadership } from "@/frontend/components/Leadership";
import { SuccessStories } from "@/frontend/components/SuccessStories";
import { Location } from "@/frontend/components/Location";
import { SocialMedia } from "@/frontend/components/SocialMedia";
import { Faq } from "@/frontend/components/Faq";
import { Contact } from "@/frontend/components/Contact";
import { LatestNews } from "@/frontend/components/LatestNews";
import { getLeadership, getLocations, getProducts } from "@/backend/site-content";

/**
 * Home page.
 *
 * Composition is deliberately not a stack of equal-weight blocks. The page
 * alternates rhythm: dark centred opening, quiet service strip, an editorial
 * split, a full-bleed photograph, more splits, then figures and one closing
 * invitation. Every existing section component is still rendered, and the
 * existing anchors (`#about`, `#services`, `#products`, `#location`, `#contact`)
 * are preserved so header links and in-page CTAs keep working.
 */
export default async function Home() {
  // Impact figures are counted from live rows rather than written as marketing
  // numbers, so they cannot quietly go out of date.
  const [products, leaders, locations] = await Promise.all([
    getProducts(),
    getLeadership(),
    getLocations(),
  ]);

  const stats = [
    { icon: "coffee", value: String(products.length), label: "Products in the catalog" },
    { icon: "users", value: String(leaders.length), label: "Elected leaders" },
    { icon: "location", value: String(locations.length), label: "Collection points" },
    { icon: "graduationcap", value: "2026", label: "Growing season" },
  ];

  return (
    <>
      <Hero />
      <TodayAtCoop />
      <Marquee />
      <Announcements />

      {/* Introduction — dark, centred, minimal. */}
      <section
        className="relative overflow-hidden bg-forest py-28 lg:py-36"
        aria-labelledby="intro-heading"
      >
        <div
          className="absolute left-1/2 top-0 size-[34rem] -translate-x-1/2 rounded-full bg-emerald-brand/12 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-6">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-light">
              Who We Are
            </p>
            <h2
              id="intro-heading"
              className="mt-7 font-display text-balance text-[clamp(1.85rem,0.9rem+2.9vw,3.4rem)] font-semibold leading-[1.1] tracking-[-0.018em] text-cream"
            >
              A member-owned cooperative, accountable to the people who grow
              the coffee
            </h2>
            <p className="mx-auto mt-8 max-w-2xl text-[clamp(1rem,0.5vw+0.9rem,1.15rem)] leading-[1.8] text-cream/70">
              Every decision, from the price paid and weight recorded to the
              bonus paid out, is set by members and visible to all of them. We
              collect, grade, add value and sell together so that a smallholder
              is not left carrying the risk alone.
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
              {[
                "Transparent weighing",
                "Open pricing",
                "Member-elected board",
              ].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 text-sm text-cream/70"
                >
                  <span
                    className="size-1 rounded-full bg-gold"
                    aria-hidden="true"
                  />
                  {item}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <ImageStatement
        image="/pictures/nursery-beds.jpg"
        alt="Rows of coffee seedlings growing in nursery beds at the cooperative"
        eyebrow="Grown Here"
        title="Every bag begins in soil we tend ourselves"
      />

      {/* Story — image + text, alternating direction. */}
      <StorySplit
        image="/pictures/coffee-harvests.jpg"
        alt="Members harvesting ripe coffee cherries by hand"
        eyebrow="The Harvest"
        title="Ripe cherry, weighed in the open, paid for the same day"
        body={[
          "Our members pick only ripe cherry and bring it to the central buying point. Each lot is weighed in front of the person who delivered it, graded for moisture and density, and the grade decides the price. No lot is downgraded quietly.",
          "Because the cooperative sells on behalf of its members, the margin stays here. It funds inputs at cost, the SACCO lending window, training for farmers who have never had access to agronomic advice, and a dividend at the end of the season.",
        ]}
        cta="Read our story"
        tone="dark"
      />

      <MissionVision />
      <Services />
      <Products />

      <ImageStatement
        image="/pictures/training-sessions.jpg"
        alt="A farmer training session in progress at the cooperative"
        eyebrow="Knowledge"
        title="Trained farmers make the difference in every season"
        height="short"
      />

      <StorySplit
        image="/pictures/storage-of-coffee-after-harvesting.jpg"
        alt="Stored coffee drying and resting after harvest"
        eyebrow="Value Addition"
        title="We store, grade and add value before anything leaves"
        body={[
          "Drying and storage are where quality is won or lost. Lots are held under cover, moisture is checked before rest, and parchment is rested before milling so the cup does not turn harsh.",
          "Grading at the cooperative means members can see the grade of their own coffee and the price that grade earns. It is a small discipline with a large effect on what buyers will pay the following season.",
        ]}
        cta="Our production facility"
        ctaHref="#products"
        reverse
      />

      <Journey
        steps={[
          {
            label: "On the Farm",
            title: "Good agronomy",
            body: "Soil testing, improved planting material and climate-smart training, delivered through the nursery and field support.",
          },
          {
            label: "At the Buying Point",
            title: "Open weighing & grading",
            body: "Cherry is weighed in front of the member, graded for moisture and density, and the grade sets the price.",
          },
          {
            label: "In the Store",
            title: "Drying, resting, milling",
            body: "Lots are dried under cover, rested, then milled and graded so members can see what their coffee is worth.",
          },
          {
            label: "To the Market",
            title: "Sold together",
            body: "The cooperative sells as one, keeping the margin in the district and returning it as inputs, credit, training and a dividend.",
          },
        ]}
      />

      <Gallery />
      <Leadership />
      <SuccessStories />
      <Location />
      <LatestNews />
      <SocialMedia />
      <Faq />
      <Contact />

      <Impact stats={stats} />

      <ClosingCta
        image="/pictures/members-happy-after-receiving-certificates.jpg"
        alt="Members smiling after receiving their certificates"
        eyebrow="Join Us"
        title="Bring your harvest to a cooperative that pays what it says"
        body="Whether you are a farmer looking for a fair buyer, a buyer looking for traceable lots, or a partner who wants to work in Kyotera District, start a conversation with us."
        primaryLabel="Contact the cooperative"
        primaryHref="#contact"
        secondaryLabel="See our products"
        secondaryHref="#products"
      />
    </>
  );
}
