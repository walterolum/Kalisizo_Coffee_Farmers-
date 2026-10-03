import type { Metadata } from "next";
import Link from "next/link";
import type { ProductCategory } from "@prisma/client";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { EmptyState, PageHero } from "@/frontend/components/PageHero";
import { Reveal } from "@/frontend/components/Reveal";
import { getProducts } from "@/backend/site-content";
import { SITE_URL } from "@/shared/site";

export const metadata: Metadata = {
  title: "Products & Catalog",
  description:
    "Coffee for sale, fertilizers, farm equipment and SACCO products available through the Kalisizo Coffee Cooperative.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/products` : undefined },
};

const CATEGORIES: { value: ProductCategory; label: string; blurb: string }[] = [
  {
    value: "COFFEE_BEANS",
    label: "Coffee Beans",
    blurb: "Washed and natural lots from our member farms.",
  },
  {
    value: "FERTILIZER_INPUTS",
    label: "Fertilizer & Inputs",
    blurb: "Soil amendments and inputs at cooperative prices.",
  },
  {
    value: "EQUIPMENT",
    label: "Equipment",
    blurb: "Processing and farm equipment for members.",
  },
  {
    value: "SACCO_PRODUCT",
    label: "SACCO Services",
    blurb: "Savings, loans and member financial services.",
  },
];

type PageProps = { searchParams: Promise<{ category?: string }> };

export default async function ProductsPage({ searchParams }: PageProps) {
  const { category } = await searchParams;
  // Ignore unknown values rather than passing them to Prisma, so a hand-edited
  // URL cannot produce a server error.
  const active = CATEGORIES.find((c) => c.value === category)?.value;
  const products = await getProducts(active);
  const activeLabel = CATEGORIES.find((c) => c.value === active)?.label;

  return (
    <>
      <PageHero
        eyebrow="What we sell"
        title="Products & Catalog"
        description="Everything the cooperative offers, from green and roasted coffee to inputs, equipment and member services."
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Filter products by category" className="mb-10 flex flex-wrap gap-2">
            <Link
              href="/products"
              aria-current={!active ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                !active
                  ? "bg-forest text-cream"
                  : "bg-white text-muted ring-1 ring-coffee/10 hover:bg-leaf"
              }`}
            >
              All
            </Link>
            {CATEGORIES.map((option) => (
              <Link
                key={option.value}
                href={`/products?category=${option.value}`}
                aria-current={option.value === active ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  option.value === active
                    ? "bg-forest text-cream"
                    : "bg-white text-muted ring-1 ring-coffee/10 hover:bg-leaf"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </nav>

          {products.length === 0 ? (
            <EmptyState
              title="No products in this category"
              description="Stock information is updated by the cooperative team. Please contact the office for current availability and pricing."
            >
              <Link href="/contact" className="btn btn-outline">
                Contact the office
              </Link>
            </EmptyState>
          ) : (
            <>
              {active && activeLabel && (
                <h2 className="sr-only">{activeLabel}</h2>
              )}
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product, i) => (
                  <Reveal key={product.id} as="li" delay={Math.min(i, 5) * 70}>
                    <article className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-coffee/8 transition-colors duration-300 hover:ring-gold/40">
                      {product.imageUrl ? (
                        <div className="relative aspect-[4/3] overflow-hidden bg-leaf">
                          <Image
                            src={product.imageUrl}
                            alt={product.title}
                            fill
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            quality={65}
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          {/* Untreated photograph - nothing is laid over it. */}
                        </div>
                      ) : (
                        <div
                          className="relative aspect-[4/3] bg-gradient-to-br from-forest via-action to-forest-deep"
                          aria-hidden="true"
                        />
                      )}
                      <div className="flex flex-1 flex-col p-6">
                        {product.badge && (
                          <span className="inline-flex w-fit rounded-full bg-gold/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-clay">
                            {product.badge}
                          </span>
                        )}
                        <h2 className="mt-3 font-display text-lg font-semibold leading-snug text-forest">
                          {product.title}
                        </h2>
                        {product.description && (
                          <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
                            {product.description}
                          </p>
                        )}
                        <div className="mt-5 border-t border-coffee/8 pt-4">
                          {product.price && (
                            <p className="font-display text-base font-semibold text-forest">
                              {product.price}
                              {product.unit && (
                                <span className="ml-1 text-sm font-normal text-muted">
                                  per {product.unit}
                                </span>
                              )}
                            </p>
                          )}
                          <Link
                            href="/contact"
                            className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-forest"
                          >
                            {product.cta || "Enquire to order"}
                            <ArrowRight
                              className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                              aria-hidden="true"
                            />
                          </Link>
                        </div>
                      </div>
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
