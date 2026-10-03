"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Headset } from "lucide-react";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { FAQS } from "@/shared/data";
import { fetchFaq } from "@/shared/api";
import { useRealtimePoll } from "@/shared/realtime";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>(FAQS);

  const load = useCallback(async () => {
    const list = await fetchFaq();
    if (!list || list.length === 0) return;
    setFaqs(list.map((f) => ({ question: f.question, answer: f.answer })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "faq");

  return (
    <section
      id="faq"
      className="relative overflow-hidden bg-leaf py-28 lg:py-36"
      aria-labelledby="faq-heading"
    >
      <div
        className="absolute -right-32 top-24 h-80 w-80 rounded-full bg-brand/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="faq-heading"
            eyebrow="Common Questions"
            title="Frequently Asked Questions"
            description="Quick answers for farmers, members and coffee buyers. Anything else? Just ask."
          />
        </Reveal>

        <div className="space-y-3.5">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <Reveal key={faq.question} delay={i * 50} as="div">
                <div
                  className={`overflow-hidden rounded-2xl bg-white ring-1 transition-all duration-300 ${
                    isOpen
                      ? "shadow-card ring-gold/40"
                      : "shadow-soft ring-forest/5 hover:ring-gold/25"
                  }`}
                >
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${i}`}
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                    >
                      <span className="font-display text-[17px] font-semibold text-forest">
                        {faq.question}
                      </span>
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full transition-all duration-300 ${
                          isOpen
                            ? "rotate-180 bg-gold text-forest"
                            : "bg-leaf text-forest"
                        }`}
                      >
                        <ChevronDown className="size-5" aria-hidden="true" />
                      </span>
                    </button>
                  </h3>
                  <div
                    id={`faq-panel-${i}`}
                    role="region"
                    className={`grid transition-all duration-300 ease-out ${
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-[15px] leading-relaxed text-muted">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={120}>
          <p className="mt-10 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-muted">
            <Headset className="size-4 text-clay" aria-hidden="true" />
            Still have a question? Reach our team below. We reply promptly.
          </p>
        </Reveal>
      </div>
    </section>
  );
}