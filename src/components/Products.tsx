"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Coffee,
  FlaskConical,
  Landmark,
  LayoutGrid,
  Leaf,
  PiggyBank,
  Recycle,
  Sprout,
  Users,
  Wheat,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { PRODUCT_CATEGORIES, PRODUCTS, type Product } from "@/lib/data";
import { useRealtimePoll } from "@/lib/realtime";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  All: LayoutGrid,
  Fertilizers: FlaskConical,
  "Coffee Beans": Coffee,
  "SACCO Services": PiggyBank,
  Equipment: Wrench,
};

const PRODUCT_ICON_MAP: Record<string, LucideIcon> = {
  coffee: Coffee,
  flask: FlaskConical,
  sprout: Sprout,
  leaf: Leaf,
  recycle: Recycle,
  piggybank: PiggyBank,
  landmark: Landmark,
  users: Users,
  wheat: Wheat,
};

const API_CATEGORY_LABEL: Record<string, string> = {
  COFFEE_BEANS: "Coffee Beans",
  FERTILIZER_INPUTS: "Fertilizers",
  EQUIPMENT: "Equipment",
  SACCO_PRODUCT: "SACCO Services",
};

type ApiProduct = {
  id: string;
  title: string;
  category: keyof typeof API_CATEGORY_LABEL;
  description: string | null;
  price: string | null;
  unit: string | null;
  badge: string | null;
  cta: string | null;
  tone: string | null;
  icon: string | null;
  isAvailable: boolean;
};

export function Products() {
  const [filter, setFilter] = useState("All");
  const [catalog, setCatalog] = useState<Product[]>(PRODUCTS);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/products?_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const apiProducts = (await res.json()) as ApiProduct[];
      if (!Array.isArray(apiProducts) || apiProducts.length === 0) return;
      setCatalog(
        apiProducts.map((api) => ({
          name: api.title,
          category: API_CATEGORY_LABEL[api.category] as Product["category"],
          badge: api.badge || "",
          description: api.description || "",
          icon:
            PRODUCT_ICON_MAP[api.icon ?? ""] ??
            CATEGORY_ICONS[api.category] ??
            LayoutGrid,
          cta: api.cta || "Enquire about availability",
          tone: api.tone || "bg-gradient-to-br from-[#0e3d28] to-[#1f7345]",
        }))
      );
    } catch {
      /* keep static fallback */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "products");

  const availableCategories = useMemo(() => {
    const fromCatalog = catalog.map((p) => p.category);
    return Array.from(new Set(["All", ...PRODUCT_CATEGORIES.slice(1), ...fromCatalog]));
  }, [catalog]);

  const filtered = useMemo(
    () =>
      filter === "All"
        ? catalog
        : catalog.filter((p) => p.category === filter),
    [catalog, filter]
  );

  return (
    <section
      id="products"
      className="relative overflow-hidden bg-cream py-28 lg:py-36"
      aria-labelledby="products-heading"
    >
      <div
        className="absolute -right-32 bottom-10 h-80 w-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="products-heading"
            eyebrow="Products & Catalog"
            title="What You Can Access Today"
            description="Quality agri-inputs, valued coffee lots and SACCO services. Filter by category to explore."
          />
        </Reveal>

        <Reveal delay={80}>
          <div
            className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-2.5 rounded-2xl bg-sand p-2 shadow-soft ring-1 ring-forest/5"
            role="tablist"
            aria-label="Filter products by category"
          >
            {availableCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={filter === cat}
                onClick={() => setFilter(cat)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 sm:px-5 ${
                  filter === cat
                    ? "bg-forest text-cream shadow-card"
                    : "text-charcoal/70 hover:bg-white hover:text-forest"
                }`}
              >
                {(() => {
                  const CatIcon = CATEGORY_ICONS[cat] ?? LayoutGrid;
                  return <CatIcon className="mr-1.5 inline size-4" aria-hidden="true" />;
                })()}
                {cat}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product, i) => (
            <Reveal key={`${filter}-${product.name}`} delay={i * 60} as="div">
              <article className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-forest/8 transition-colors duration-300 hover:ring-gold/40">
                <div className={`relative h-36 overflow-hidden ${product.tone}`}>
                  <div className="relative flex h-full items-center justify-between p-5">
                    <span className="grid size-12 place-items-center rounded-full bg-white/15 text-cream transition-transform duration-500 group-hover:scale-105">
                      <product.icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cream/80">
                      {product.category}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-display text-xl font-semibold text-forest">
                    {product.name}
                  </h3>
                  {product.badge && (
                    <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-deep">
                      {product.badge}
                    </span>
                  )}
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-charcoal/70">
                    {product.description}
                  </p>
                  <a
                    href="#contact"
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-brand transition-colors hover:text-gold-deep"
                  >
                    {product.cta}
                    <ArrowUpRight
                      className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </a>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={100}>
          <p className="mt-10 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-charcoal/60">
            <LayoutGrid className="size-4 text-gold-deep" aria-hidden="true" />
            Catalog not exhaustive. Reach out for current stock and input prices.
            and wholesale coffee prices.
          </p>
        </Reveal>
      </div>
    </section>
  );
}