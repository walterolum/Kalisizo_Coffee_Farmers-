import Image from "next/image";
import { Leaf } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";

type GalleryItem = {
  src: string;
  alt: string;
  label: string;
  className: string;
};

const GALLERY: GalleryItem[] = [
  {
    src: "/pictures/nursery-beds.jpg",
    alt: "Coffee nursery beds prepared for seedlings at the cooperative",
    label: "Nursery Beds",
    className: "col-span-2 row-span-2",
  },
  {
    src: "/pictures/coffee-farms.jpg",
    alt: "Lush coffee farms in Kalisizo tended by cooperative members",
    label: "Coffee Farms",
    className: "",
  },
  {
    src: "/pictures/coffee-harvests.jpg",
    alt: "Members harvesting ripe coffee cherries",
    label: "Coffee Harvests",
    className: "",
  },
  {
    src: "/pictures/storage-of-coffee-after-harvesting.jpg",
    alt: "Proper storage of coffee after harvesting",
    label: "Storage After Harvest",
    className: "col-span-2 lg:col-span-1",
  },
  {
    src: "/pictures/skilling-the-old-on-how-coffee-is-grown.jpg",
    alt: "Training elders on how coffee is grown",
    label: "Skilling Elders",
    className: "",
  },
  {
    src: "/pictures/training-sessions.jpg",
    alt: "Cooperative training sessions for farmers",
    label: "Training Sessions",
    className: "",
  },
  {
    src: "/pictures/youth-trainings.jpg",
    alt: "Youth trainings on coffee agronomy",
    label: "Youth Trainings",
    className: "col-span-2",
  },
  {
    src: "/pictures/skilling-group-members-and-other-people.jpg",
    alt: "Skilling group members and community",
    label: "Skilling Groups",
    className: "",
  },
  {
    src: "/pictures/executive-meetings.jpg",
    alt: "Executive meetings of the cooperative leadership",
    label: "Executive Meetings",
    className: "",
  },
  {
    src: "/pictures/sacco-meetings.jpg",
    alt: "SACCO meetings for member savings and loans",
    label: "SACCO Meetings",
    className: "col-span-2 lg:col-span-2",
  },
  {
    src: "/pictures/mini-sacco-meetings.jpg",
    alt: "Mini SACCO meetings at village level",
    label: "Mini SACCO",
    className: "",
  },
  {
    src: "/pictures/awarding-members-with-certificates.jpg",
    alt: "Awarding members with certificates after training",
    label: "Awarding Members",
    className: "",
  },
  {
    src: "/pictures/certificate-awards.jpg",
    alt: "Certificate awards ceremony for members",
    label: "Certificate Awards",
    className: "",
  },
  {
    src: "/pictures/members-happy-after-receiving-certificates.jpg",
    alt: "Members happy after receiving certificates",
    label: "Happy Members",
    className: "col-span-2",
  },
];

export function Gallery() {
  return (
    <section
      id="gallery"
      className="relative overflow-hidden bg-forest py-28 lg:py-36"
      aria-labelledby="gallery-heading"
    >
      <div
        className="absolute -right-24 -top-24 size-80 rounded-full bg-gold/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            id="gallery-heading"
            eyebrow="From Farm to Cup"
            title="Taste the Journey in Every Bean"
            description="From shaded hillside farms to your cup. A look at the care, craft and community behind Kalisizo coffee."
            tone="dark"
          />
        </Reveal>

        <Reveal delay={100}>
          <div className="grid auto-rows-[42vw] grid-cols-2 gap-3 sm:auto-rows-[210px] sm:gap-4 lg:grid-cols-4">
            {GALLERY.map((item) => (
              <figure
                key={item.src}
                className={`group relative overflow-hidden rounded-2xl shadow-card ${item.className}`}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(min-width: 1024px) 50vw, (min-width: 640px) 50vw, 100vw"
                  quality={65}
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-forest/75 via-transparent to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-95"
                  aria-hidden="true"
                />
                <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-light backdrop-blur-sm">
                    <Leaf className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-bold text-cream">
                    {item.label}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}