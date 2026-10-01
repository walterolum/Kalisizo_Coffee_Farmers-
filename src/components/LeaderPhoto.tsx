"use client";

import { useState } from "react";
import Image from "next/image";

type LeaderPhotoProps = {
  src: string;
  name: string;
  initials: string;
  gradient: string;
};

export function LeaderPhoto({
  src,
  name,
  initials,
  gradient,
}: LeaderPhotoProps) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const safeSrc = typeof src === "string" ? src.trim() : "";

  if (!safeSrc) {
    return (
      <div
        className={`absolute inset-0 grid place-items-center bg-gradient-to-br ${gradient}`}
      >
        <span className="font-display text-5xl font-bold text-cream">
          {initials}
        </span>
      </div>
    );
  }

  if (errored) {
    return (
      <div
        className={`absolute inset-0 grid place-items-center bg-gradient-to-br ${gradient}`}
      >
        <span className="font-display text-5xl font-bold text-cream">
          {initials}
        </span>
      </div>
    );
  }

  return (
    <>
      <Image
        src={safeSrc}
        alt={`Photo of ${name}`}
        fill
        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 46vw, 92vw"
        onError={() => setErrored(true)}
        onLoad={() => setLoaded(true)}
        // Slightly over-scaled so the face fills the frame instead of sitting in
        // a letterboxed band, and biased upward so head and shoulders survive
        // the crop on the taller source photos. The parent group drives the
        // matching zoom on hover so the transform reads as one movement.
        className={`scale-[1.06] object-cover object-[center_25%] transition-[opacity,transform] duration-500 group-hover:scale-[1.12] ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
      {!loaded && (
        <div
          className={`absolute inset-0 grid place-items-center bg-gradient-to-br ${gradient}`}
        >
          <span className="font-display text-5xl font-bold text-cream">
            {initials}
          </span>
        </div>
      )}
    </>
  );
}