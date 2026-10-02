type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  tone?: "light" | "dark";
  id?: string;
  /**
   * Heading level to render.
   *
   * Defaults to `h2` because this component is nearly always a section *within*
   * a page whose hero already supplied the `h1`. A page whose first and only
   * heading comes from here must pass `h1`, or it ships with no `h1` at all —
   * which is what `/contact` did.
   */
  as?: "h1" | "h2";
};

/**
 * Standard section introduction: small tracked label, display heading, optional
 * supporting line.
 *
 * This deliberately matches the treatment already used inline by the narrative
 * sections (`ImageStatement`, `Journey`, `Impact`, `ClosingCta`) and the home
 * page intro. An earlier version here wrapped the label in a filled pill with a
 * bean icon and added a gradient bar under the heading, which made every section
 * that used this component look different from the ones that hand-wrote the same
 * three lines. One shared language, no extra chrome.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "light",
  id,
  as: Heading = "h2",
}: SectionHeadingProps) {
  const light = tone === "dark";
  const centered = align === "center";

  return (
    <div
      className={`mb-16 ${centered ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${
          light ? "text-gold-light" : "text-gold-deep"
        }`}
      >
        {eyebrow}
      </p>

      <Heading
        id={id}
        className={`mt-7 font-display text-balance text-[clamp(1.85rem,0.9rem+2.7vw,3.2rem)] font-semibold leading-[1.1] tracking-[-0.018em] ${
          light ? "text-cream" : "text-forest"
        }`}
      >
        {title}
      </Heading>

      {description && (
        <p
          className={`mt-7 text-pretty text-[clamp(1rem,0.4vw+0.92rem,1.125rem)] leading-[1.75] ${
            light ? "text-cream/70" : "text-charcoal/65"
          } ${centered ? "mx-auto max-w-2xl" : ""}`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
