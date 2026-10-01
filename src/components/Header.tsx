"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Mail, MapPin, Phone, Search, ShieldCheck, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { CONTACT, NAV_LINKS } from "@/lib/data";
import { fetchSettings, type ApiSettings } from "@/lib/api";
import { useRealtimePoll } from "@/lib/realtime";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const pathname = usePathname();

  /**
   * A link is current when the visitor is on its page, or on a detail page
   * beneath it (`/news/slug` still highlights "News"). "/" only matches exactly
   * so it is not highlighted on every page.
   */
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const load = useCallback(async () => {
    const info = await fetchSettings();
    if (!info) return;
    setSettings(info);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "settings");

  const drawerPhone = settings?.phoneNumbers?.[0] || CONTACT.phones[0];
  const drawerEmail = settings?.officialEmail || CONTACT.email;
  const drawerAddress = settings?.address || CONTACT.address;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const el = drawerRef.current;
      if (!el) return;
      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => node.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onTab, true);
    return () => {
      document.removeEventListener("keydown", onTab, true);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setOpen(false);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled && !open
            ? "border-b border-white/10 bg-forest/90 shadow-[0_10px_30px_rgba(8,35,24,0.18)] backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const current = isCurrent(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`group relative rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                  current ? "text-gold-light" : "text-cream/80 hover:text-gold-light"
                }`}
              >
                {link.label}
                <span
                  className={`absolute inset-x-2.5 bottom-0.5 h-px origin-left bg-gold-light transition-transform duration-200 ${
                    current ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                  }`}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/search"
            aria-label="Search the site"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-cream transition-colors hover:bg-white/10"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>

          <Link
            href="/contact#inquiry"
            className="btn btn-primary btn-sm hidden md:inline-flex"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Inquire Now
          </Link>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-cream transition-colors hover:bg-white/10 xl:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

    <div
      id="mobile-menu"
      className={`fixed inset-0 z-[60] xl:hidden ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className={`absolute inset-0 bg-forest-deep/80 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />

      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile menu"
        className={`absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-forest-deep shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-5">
          <span className="font-display text-lg font-semibold text-cream">
            Menu
          </span>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            aria-label="Close navigation menu"
            className="grid size-11 place-items-center rounded-xl border border-white/15 text-cream transition-colors hover:bg-white/10"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-10 pt-6">
          <ul className="space-y-1">
            {NAV_LINKS.map((link, i) => {
              const current = isCurrent(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={close}
                    aria-current={current ? "page" : undefined}
                    className={`group flex items-center justify-between rounded-2xl px-4 py-3.5 text-[17px] font-medium transition-all duration-200 hover:bg-white/10 hover:text-gold-light ${
                      current ? "bg-white/10 text-gold-light" : "text-cream/85"
                    }`}
                  >
                    {link.label}
                    <span className="text-xs text-gold opacity-0 transition-opacity group-hover:opacity-100">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Link
            href="/search"
            onClick={close}
            className="btn btn-ghost btn-lg mt-8 w-full"
          >
            <Search className="size-4" aria-hidden="true" />
            Search the site
          </Link>

          <Link
            href="/contact#inquiry"
            onClick={close}
            className="btn btn-primary btn-lg mt-3 w-full"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Join Cooperative / Inquire
          </Link>

          <Link
            href="/publications"
            onClick={close}
            className="btn btn-ghost btn-lg mt-3 w-full"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Publications
          </Link>

          <Link
            href="/admin"
            onClick={close}
            className="btn btn-ghost btn-lg mt-3 w-full"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Open Admin
          </Link>

          <div className="mt-8 space-y-3 border-t border-white/10 pt-7 text-sm text-cream/70">
            <p className="flex items-center gap-3">
              <Phone className="size-4 shrink-0 text-gold" aria-hidden="true" />
              {drawerPhone}
            </p>
            <p className="flex items-center gap-3">
              <Mail className="size-4 shrink-0 text-gold" aria-hidden="true" />
              <span className="min-w-0 break-words">{drawerEmail}</span>
            </p>
            <p className="flex items-center gap-3">
              <MapPin className="size-4 shrink-0 text-gold" aria-hidden="true" />
              {drawerAddress}
            </p>
          </div>
        </div>
      </aside>
    </div>
  </>
  );
}