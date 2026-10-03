"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Briefcase,
  Crown,
  FileText,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { LeaderPhoto } from "@/frontend/components/LeaderPhoto";
import { Reveal } from "@/frontend/components/Reveal";
import { SectionHeading } from "@/frontend/components/SectionHeading";
import { LEADERS, type Leader } from "@/shared/data";
import { useRealtimePoll } from "@/shared/realtime";

const LEADER_ICONS: Record<string, LucideIcon> = {
  crown: Crown,
  briefcase: Briefcase,
  wallet: Wallet,
  file: FileText,
  users: Users,
};

type ApiLeader = {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  photoUrl: string | null;
  icon: string | null;
  gradient: string | null;
  displayOrder: number;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Leadership() {
  const [leaders, setLeaders] = useState<Leader[]>(LEADERS);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/leadership?_t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const apiLeaders = (await res.json()) as ApiLeader[];
      if (!Array.isArray(apiLeaders) || apiLeaders.length === 0) return;
      setLeaders(
        apiLeaders.map((api) => ({
          name: api.name,
          role: api.title || "Committee Member",
          description: api.bio || "",
          photo: api.photoUrl || "",
          initials: initialsOf(api.name),
          icon: api.icon || "users",
          gradient: api.gradient || "from-action to-forest-deep",
        }))
      );
    } catch {
      /* keep static fallback */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimePoll(load, undefined, "leadership");

  return (
    <section
      id="leadership"
      className="relative overflow-hidden bg-leaf py-28 lg:py-36"
      aria-labelledby="leadership-heading"
    >
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="leadership-heading"
            eyebrow="About & Leadership"
            title="Guided by Trusted Farmer Leaders"
            description="Elected by members and accountable to members, this leadership sets the standard for transparency and fair dealing."
          />
        </Reveal>

        {/* Three across keeps each portrait small enough to read as a person
            rather than a wall of faces, and the 4:5 frame matches the
            portrait-oriented source photos so faces are no longer cropped to a
            band. The closing panel spans the full row below. */}
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {leaders.map((leader, i) => (
            <Reveal key={leader.name} delay={i * 70} as="li">
              <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-forest/8 transition-colors duration-300 hover:ring-gold/40">
                <div className="relative aspect-[4/5] overflow-hidden">
                  {leader.photo ? (
                    <LeaderPhoto
                      src={leader.photo}
                      name={leader.name}
                      initials={leader.initials}
                      gradient={leader.gradient}
                    />
                  ) : (
                    <div
                      className={`absolute inset-0 grid place-items-center bg-gradient-to-br ${leader.gradient}`}
                    >
                      <span className="font-display text-5xl font-bold text-cream">
                        {leader.initials}
                      </span>
                    </div>
                  )}
                  <span className="absolute right-3 top-3 grid size-9 place-items-center bg-cream/95 text-forest transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                    {(() => {
                      const RoleIcon = LEADER_ICONS[leader.icon] ?? Users;
                      return (
                        <RoleIcon className="size-4.5" aria-hidden="true" />
                      );
                    })()}
                  </span>
                  <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 bg-cream/95 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-forest">
                    <Award className="size-3.5" aria-hidden="true" />
                    {leader.role}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <h3 className="font-display text-xl font-semibold leading-tight text-forest">
                    {leader.name}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                    {leader.description}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}

          {/* Spans the full row below the portraits: a closing statement, not a
              peer card. */}
          <Reveal
            delay={leaders.length * 70}
            as="li"
            className="sm:col-span-2 lg:col-span-3"
          >
            <article className="group relative flex h-full flex-col justify-center overflow-hidden bg-forest p-7 sm:p-10">
              <div
                className="absolute -right-14 -top-14 size-44 rounded-full bg-gold/20 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative max-w-3xl">
                <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-light">
                  <Award className="size-3.5" aria-hidden="true" />
                  Co-op Leadership
                </span>
                <p className="mt-6 font-display text-2xl font-semibold leading-snug text-cream sm:text-3xl">
                  Leadership stands ready to serve every member,{" "}
                  <span className="text-gold-light">
                    with respect, accountability and care.
                  </span>
                </p>
                <p className="mt-5 text-sm leading-relaxed text-cream/70">
                  Reach the committee through the office or the contact section
                  below. Member enquiries are always welcome.
                </p>
              </div>
            </article>
          </Reveal>
        </ul>
      </div>
    </section>
  );
}