"use client";

import Link from "next/link";

import { useState } from "react";

import { useCart } from "@/components/shop/CartProvider";
import { useHaptics } from "@/components/telegram/provider";
import { Button } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { ProductImage } from "@/components/shop/ProductImage";
import { Stepper } from "@/components/ui/Stepper";

/**
 * The lines of a request.
 *
 * Every line is editable in place, because this is the screen where a buyer
 * settles the order — sending them back to the product page to change six to
 * twelve would lose the rest of what they are assembling.
 *
 * The picture is small and the quantity is large. On a market floor the numbers
 * are what is being checked.
 */
export function CartLines({ showPrices }: { showPrices: boolean }) {
  const { lines, setQuantity, remove } = useCart();
  const haptics = useHaptics();

  /**
   * Basket lines whose photograph will not load.
   *
   * The basket is the one place a picture is addressed by a key the browser has
   * been holding for days. An administrator who replaced or removed that
   * photograph leaves the key pointing at nothing, and the buyer gets a broken
   * image in the middle of their own request — which reads as the shop being
   * broken, not as a missing file. Falling back to the monogram is the state
   * this catalog already has for a product with no photograph at all, and it
   * looks deliberate because it is.
   */
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());

  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line) => (
        <li key={line.productId} className="stage p-3">
          <div className="flex gap-3">
            <Link href={`/p/${line.slug}`} className="w-20 shrink-0">
              <ProductImage
                image={
                  line.imageKey && !broken.has(line.productId)
                    ? { key: line.imageKey, width: 400, height: 500, blurDataUrl: "" }
                    : undefined
                }
                title={line.title}
                brandName={line.brandName}
                sizes="80px"
                onError={() => setBroken((b) => new Set(b).add(line.productId))}
              />
            </Link>

            {/* The name first and in weight, the rest small beneath it — the
                brand used to sit above the name in spaced caps, a caption over
                the thing it names. */}
            <div className="min-w-0 flex-1">
              <p className="display-caps text-ink text-sm leading-tight">
                <Link href={`/p/${line.slug}`}>{line.title}</Link>
              </p>
              <p className="text-muted mt-1.5 text-xs leading-snug">
                {line.brandName} · {line.format}
                {line.seenPackSize > 1 ? ` · кратно ${line.seenPackSize}` : ""}
              </p>
              <div className="mt-1.5">
                <Price
                  kop={line.seenPriceKop}
                  showPrices={showPrices}
                  className="text-base"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Stepper
              qty={line.qty}
              packSize={line.seenPackSize}
              label={line.title}
              onChange={(next) => {
                haptics.tap();
                setQuantity(line.productId, next);
              }}
            />
            <div className="flex items-center gap-4">
              {showPrices ? (
                <Price kop={line.seenPriceKop * line.qty} showPrices className="text-lg" />
              ) : null}
              <Button
                variant="quiet"
                onClick={() => {
                  haptics.tap();
                  remove(line.productId);
                }}
                aria-label={`Убрать: ${line.title}`}
              >
                Убрать
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
