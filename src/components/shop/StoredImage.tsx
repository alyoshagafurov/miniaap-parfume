import type { CSSProperties, ImgHTMLAttributes } from "react";

import { imageSrcSet, objectUrl } from "@/lib/media";

/**
 * An image already resized by sharp at upload time. The browser selects the
 * smallest stored rendition that fits the rendered size and device pixel
 * ratio; AVIF is preferred, with WebP as the fallback.
 */
export function StoredImage({
  imageKey,
  width,
  height,
  sourceWidth = width,
  alt,
  sizes,
  pictureClassName = "block w-full",
  className,
  style,
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
  onError,
}: {
  imageKey: string;
  width: number;
  height: number;
  /** The original pixel width, used to avoid requesting renditions not made. */
  sourceWidth?: number;
  alt: string;
  sizes?: string;
  pictureClassName?: string;
  className?: string;
  style?: CSSProperties;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  decoding?: ImgHTMLAttributes<HTMLImageElement>["decoding"];
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>["fetchPriority"];
  onError?: ImgHTMLAttributes<HTMLImageElement>["onError"];
}) {
  const avifSrcSet = imageSrcSet(imageKey, sourceWidth, "avif");
  const webpSrcSet = imageSrcSet(imageKey, sourceWidth, "webp");

  return (
    <picture className={pictureClassName}>
      {avifSrcSet ? <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} /> : null}
      <img
        src={objectUrl(imageKey)}
        srcSet={webpSrcSet}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onError={onError}
        className={className}
        style={style}
      />
    </picture>
  );
}
