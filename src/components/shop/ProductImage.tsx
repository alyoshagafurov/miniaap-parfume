import { productName } from "@/lib/format";
import { objectUrl } from "@/lib/media";

/**
 * A product image, or the state that stands in for one.
 *
 * The client has photographs of their whole range but is entering the catalog
 * themselves, so for much of this product's life a given item will have no
 * photo. That makes the placeholder a designed state rather than a fallback:
 * the monogram on the surface colour, composed to look deliberate. It must
 * never read as "image failed to load".
 *
 * `label` is off in a list, where the brand and name already sit directly under
 * the image — repeating them inside it printed the brand twice on every card
 * and made a screen reader announce it three times. It is on where the
 * placeholder stands alone, such as a product page, and needs to say what it
 * is.
 *
 * The accessible name goes through `productName` rather than being composed
 * here, because the client's titles already begin with the brand: spelling it
 * out as brand + title made every photo in the catalog announce «Chanel Chanel
 * Coco Mademoiselle».
 *
 * Always 4:5, always with width and height, so a card reserves its space and
 * the list never shifts as images arrive.
 *
 * It sits in a well of the canvas colour inside the card's white stage, not on
 * the white itself. The reference stands its garment on pure white, and a
 * perfume bottle is glass: on white it dissolves at the edges, and the client's
 * photographs arrive from a Telegram channel on whatever background each was
 * shot against. The well gives every one of them the same ground.
 */
export function ProductImage({
  image,
  title,
  brandName,
  label = false,
  prominent = false,
  sizes = "(max-width: 767px) 50vw, 240px",
  priority = false,
  onError,
}: {
  image:
    { key: string; width: number; height: number; blurDataUrl: string } | undefined;
  title: string;
  brandName: string;
  label?: boolean;
  /**
   * The placeholder stands alone on a product page, where the box is two to
   * three times the width of a card. The monogram was sized for the card, so
   * at that scale it read as a small mark adrift in an empty rectangle rather
   * than as a designed surface.
   */
  prominent?: boolean;
  sizes?: string;
  priority?: boolean;
  /**
   * Only a client caller passes this. The basket is the one place a picture is
   * addressed by a key the browser has held for days, so it is the one place
   * that needs to notice the file is gone. `error` does not bubble, so the
   * handler has to be on the <img> itself — a wrapper cannot catch it.
   */
  onError?: () => void;
}) {
  if (!image) {
    return (
      <div
        className="bg-canvas flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-md px-4 text-center"
        role="img"
        aria-label={`${productName(brandName, title)} — фотография готовится`}
      >
        <span
          aria-hidden
          className={`font-wordmark text-wordmark leading-tight ${prominent ? "text-5xl sm:text-6xl" : "text-4xl"}`}
        >
          Á
        </span>
        {label ? (
          <span aria-hidden className="caps text-muted line-clamp-2">
            {brandName}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    // Not next/image: sharp already renders AVIF and WebP at three widths on
    // upload, so images.unoptimized is set and next/image would emit this same
    // element while adding client JS. Width, height, blur placeholder, lazy
    // loading and sizes — everything the rule is protecting — are all present.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={objectUrl(image.key)}
      alt={productName(brandName, title)}
      width={image.width}
      height={image.height}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={onError}
      className="bg-canvas aspect-[4/5] w-full rounded-md object-cover"
      style={{ backgroundImage: `url(${image.blurDataUrl})`, backgroundSize: "cover" }}
    />
  );
}
