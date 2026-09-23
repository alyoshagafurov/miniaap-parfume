"use client";

import Link from "next/link";

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

  return (
    <ul className="flex flex-col">
      {lines.map((line) => (
        <li key={line.productId} className="border-rule border-b py-4 first:pt-0">
          <div className="flex gap-3">
            <Link href={`/p/${line.slug}`} className="w-20 shrink-0">
              <ProductImage
                image={
                  line.imageKey
                    ? { key: line.imageKey, width: 400, height: 500, blurDataUrl: "" }
                    : undefined
                }
                title={line.title}
                brandName={line.brandName}
                sizes="80px"
              />
            </Link>

            <div className="min-w-0 flex-1">
              <p className="caps text-muted">{line.brandName}</p>
              <p className="text-ink text-sm leading-snug font-medium">
                <Link href={`/p/${line.slug}`}>{line.title}</Link>
              </p>
              <p className="text-muted mt-0.5 text-xs">
                {line.format}
                {line.seenPackSize > 1 ? ` · кратно ${line.seenPackSize}` : ""}
              </p>
              <div className="mt-1">
                <Price kop={line.seenPriceKop} showPrices={showPrices} className="text-sm" />
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
                <span className="text-ink text-base font-semibold tabular-nums">
                  <Price kop={line.seenPriceKop * line.qty} showPrices />
                </span>
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
