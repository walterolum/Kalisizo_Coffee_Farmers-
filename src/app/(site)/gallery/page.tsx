import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { EmptyState, PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { getPublishedGalleryImages } from "@/lib/site-content";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Gallery",
  description:
    "Photographs from the farms, washing stations and community events of the Kalisizo Coffee Cooperative.",
  alternates: { canonical: SITE_URL ? `${SITE_URL}/gallery` : undefined },
};

type PageProps = { searchParams: Promise<{ album?: string }> };

export default async function GalleryPage({ searchParams }: PageProps) {
  const { album } = await searchParams;
  const images = await getPublishedGalleryImages(96);

  const albums = Array.from(
    new Map(
      images
        .filter((image) => image.album)
        .map((image) => [image.album!.slug, image.album!])
    ).values()
  );
  const activeAlbum = albums.find((a) => a.slug === album)?.slug;
  const visible = activeAlbum
    ? images.filter((image) => image.album?.slug === activeAlbum)
    : images;

  return (
    <>
      <PageHero
        eyebrow="Pictures"
        title="Gallery"
        description="Moments from the harvest, the washing stations and the community that makes it all work."
      />

      <section className="bg-cream py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {albums.length > 0 && (
            <nav aria-label="Filter gallery by album" className="mb-10 flex flex-wrap gap-2">
              <AlbumChip href="/gallery" label="All photos" active={!activeAlbum} />
              {albums.map((item) => (
                <AlbumChip
                  key={item.slug}
                  href={`/gallery?album=${item.slug}`}
                  label={item.title}
                  active={item.slug === activeAlbum}
                />
              ))}
            </nav>
          )}

          {visible.length === 0 ? (
            <EmptyState
              title="No photos yet"
              description="Photographs will appear here once the cooperative publishes them to the gallery."
            />
          ) : (
            <>
              <h2 className="sr-only">Gallery images</h2>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {visible.map((image, i) => (
                  <Reveal key={image.id} as="li" delay={Math.min(i, 7) * 50}>
                    <figure className="group relative overflow-hidden rounded-2xl bg-sand ring-1 ring-charcoal/8">
                      <div className="relative aspect-square w-full">
                        <Image
                          src={image.thumbnailUrl || image.url}
                          alt={image.alt}
                          fill
                          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                          quality={50}
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      {image.caption && (
                        <figcaption className="px-3 py-2.5 text-[12.5px] leading-snug text-charcoal/60">
                          {image.caption}
                        </figcaption>
                      )}
                    </figure>
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

function AlbumChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-forest text-cream"
          : "bg-white text-charcoal/65 ring-1 ring-charcoal/10 hover:bg-sand"
      }`}
    >
      {label}
    </Link>
  );
}
