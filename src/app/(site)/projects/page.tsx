import type { Metadata } from "next";
import Link from "next/link";
import { ProjectCard } from "@/components/ContentCards";
import { EmptyState, PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { getPublishedProjects } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Projects & Impact",
  description:
    "Cooperative projects, partnerships and completed work across Kalisizo Sub County, from washing stations to farmer training.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/projects` : undefined },
};

const STAGES = [
  { value: "", label: "All" },
  { value: "ONGOING", label: "Ongoing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PLANNED", label: "Planned" },
] as const;

type PageProps = { searchParams: Promise<{ stage?: string }> };

export default async function ProjectsPage({ searchParams }: PageProps) {
  const { stage } = await searchParams;
  const activeStage = STAGES.find((s) => s.value === (stage ?? ""))?.value ?? "";
  const projects = await getPublishedProjects(60);
  const visible = activeStage
    ? projects.filter((project) => project.stage === activeStage)
    : projects;

  return (
    <>
      <PageHero
        eyebrow="What we've built"
        title="Projects & Impact"
        description="Every project below is funded and delivered by the cooperative together with our partners and members."
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Filter projects by stage" className="mb-10 flex flex-wrap gap-2">
            {STAGES.map((option) => {
              const isActive = option.value === activeStage;
              return (
                <Link
                  key={option.label}
                  href={option.value ? `/projects?stage=${option.value}` : "/projects"}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-forest text-cream"
                      : "bg-white text-charcoal/65 ring-1 ring-charcoal/10 hover:bg-sand"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>

          {visible.length === 0 ? (
            <EmptyState
              title="No projects to show"
              description={
                activeStage
                  ? "There are no projects at this stage right now. Try viewing all projects."
                  : "Projects will appear here as soon as they are published."
              }
            >
              {activeStage && (
                <Link href="/projects" className="btn btn-outline">
                  View all projects
                </Link>
              )}
            </EmptyState>
          ) : (
            <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((project, i) => (
                <Reveal key={project.id} as="li" delay={Math.min(i, 5) * 70}>
                  <ProjectCard
                    href={`/projects/${project.slug}`}
                    title={project.title}
                    summary={project.summary}
                    imageUrl={project.imageUrl}
                    imageAlt={project.imageAlt}
                    location={project.location}
                    stage={project.stage}
                  />
                </Reveal>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
