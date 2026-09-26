import Link from "next/link";

import { ProductForm } from "@/components/admin/ProductForm";
import type { PublishStatusName, StockStateName } from "@/lib/admin-products";
import { kopToField } from "@/lib/money";
import { getProductForm, listBrandOptions } from "@/server/admin/product-form";

/**
 * The form, with everything it needs.
 *
 * A server component so the mapping from stored rows to form fields — kopecks
 * to roubles, an enum to a select value — happens once, here, rather than in
 * two places that drift.
 */
export async function ProductFormLoader({ id }: { id: string | null }) {
  const [{ product, categories }, brands] = await Promise.all([
    getProductForm(id),
    listBrandOptions(),
  ]);

  if (id && !product) {
    return (
      <div>
        <p className="text-ink text-lg">Товар не найден</p>
        <p className="text-muted mt-2 text-sm">Возможно, его удалили.</p>
        <Link
          href="/admin/products"
          className="text-primary mt-4 inline-block underline underline-offset-4"
        >
          Ко всем товарам
        </Link>
      </div>
    );
  }

  const first = categories[0]?.id ?? "";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link
            href="/admin/products"
            className="text-muted hover:text-ink inline-flex min-h-11 items-center text-sm font-semibold"
          >
            ← Все товары
          </Link>
          <h1 className="display-caps text-ink text-h1">
            {product ? product.title : "Новый товар"}
          </h1>
          {product ? (
            <p className="text-muted mt-1 text-sm">
              {product.sku} ·{" "}
              <Link
                href={`/p/${product.slug}`}
                className="underline underline-offset-4"
              >
                открыть на витрине
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <ProductForm
        productId={product?.id ?? null}
        categories={categories}
        brands={brands}
        images={product?.images ?? []}
        initialFragrances={product?.fragrances ?? []}
        initial={{
          categoryId: product?.categoryId ?? first,
          sku: product?.sku ?? "",
          // Empty, not the stored value: these fields are overrides, and a
          // pre-filled one turns "generated unless you say otherwise" into a
          // value somebody typed and nobody will update again.
          title: "",
          slug: "",
          volume: product ? String(product.volumeMl) : "",
          price: product ? kopToField(product.priceKop) : "",
          oldPrice: product ? kopToField(product.oldPriceKop) : "",
          packSize: product ? String(product.packSize) : "1",
          stock: (product?.stock ?? "IN_STOCK") as StockStateName,
          status: (product?.status ?? "DRAFT") as PublishStatusName,
          isNew: product?.isNew ?? false,
          isHit: product?.isHit ?? false,
          popularity: product ? String(product.popularity) : "0",
        }}
      />
    </>
  );
}
