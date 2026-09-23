"use client";

import { useCallback, useRef, useState } from "react";

export interface GalleryImage {
  src: string;
  width: number;
  height: number;
  blurDataUrl: string;
}

/**
 * The product gallery.
 *
 * Swiping is CSS — a scroll-snap track — not a carousel library. A phone
 * already knows how to fling a horizontal scroller, with the right rubber-band
 * at the ends, the right momentum, and no JavaScript on the main thread while
 * the finger is down. The only thing script does here is mirror the position
 * into the dots and move the track when a dot is tapped.
 *
 * URLs are resolved on the server and handed in, rather than built here from
 * the image keys — this component only lays photographs out, and the page it
 * belongs to already has them.
 *
 * With one image there is no track and no dots at all, which is the common case
 * while the client is still photographing their range.
 */
export function Gallery({
  images,
  alt,
}: {
  images: readonly GalleryImage[];
  alt: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // Round rather than floor: half a frame past the midpoint is the next
    // image as far as the buyer is concerned.
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((current) => (current === next ? current : next));
  }, []);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    // Instant, not smooth. Tapping a dot is navigating a list, which the
    // direction keeps still — and a JS `behavior: "smooth"` would override the
    // stylesheet's reduced-motion `scroll-behavior: auto` anyway, so the one
    // person who asked for no motion would have been the one to get it.
    el.scrollTo({ left: i * el.clientWidth, behavior: "auto" });
  };

  if (images.length === 0) return null;

  const first = images[0];
  if (images.length === 1 && first) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={first.src}
        alt={alt}
        width={first.width}
        height={first.height}
        sizes="(max-width: 767px) 100vw, 640px"
        fetchPriority="high"
        decoding="async"
        className="bg-surface aspect-[4/5] w-full rounded-md object-cover"
        style={{
          backgroundImage: `url(${first.blurDataUrl})`,
          backgroundSize: "cover",
        }}
      />
    );
  }

  return (
    <div>
      <div
        ref={track}
        onScroll={onScroll}
        // tabIndex + role: a horizontal scroller is keyboard-operable only if
        // it can be focused, and a screen reader should announce what it is.
        tabIndex={0}
        role="group"
        aria-label={`${alt} — фотографии, ${images.length}`}
        className="flex w-full snap-x snap-mandatory overflow-x-auto rounded-md"
      >
        {images.map((image, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.src}
            src={image.src}
            alt={i === 0 ? alt : ""}
            width={image.width}
            height={image.height}
            sizes="(max-width: 767px) 100vw, 640px"
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            decoding="async"
            className="bg-surface aspect-[4/5] w-full shrink-0 snap-center object-cover"
            style={{
              backgroundImage: `url(${image.blurDataUrl})`,
              backgroundSize: "cover",
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-2">
        {images.map((image, i) => (
          <button
            key={image.src}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Фото ${i + 1}`}
            aria-current={i === index}
            // The dot is 6px; the button around it is 44. The target has to be
            // reachable with a thumb, the mark does not have to be that big.
            className="flex h-11 w-6 items-center justify-center"
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-150 ease-out ${
                i === index ? "bg-olive" : "bg-rule"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
