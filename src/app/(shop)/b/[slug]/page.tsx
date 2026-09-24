import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProductCard } from "@/components/shop/ProductCard";
import { ProductGridSkeleton } from "@/components/shop/ProductGrid";
import { GoldRule, RuledHeading } from "@/components/ui/GoldRule";
import { getBrandBySlug, getBrandProducts } from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  return { title: brand ? brand.name : "Бренд не найден" };
}

/**
 * A brand.
 *
 * Grouped by format, per the brief. A buyer stocking one shelf wants that
 * brand's 35 ml pencils together, not the brand's whole range interleaved.
 */
export default function BrandPage({ params }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16">
      <Suspense fallback={<BrandSkeleton />}>
        <Brand params={params} />
      </Suspense>
    </main>
  );
}

async function Brand({ params }: PageProps) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const [settings, groups] = await Promise.all([
    getSettings(),
    getBrandProducts(brand.id),
  ]);

  return (
    <>
      <header className="pb-2">
        <h1 className="font-display text-ink text-h1 leading-tight font-semibold">
          {brand.name}
        </h1>
        <GoldRule className="mt-4 w-24" />
      </header>

      {groups.length === 0 ? (
        <div className="mt-8">
          <p className="text-ink text-lg">Пока ничего нет</p>
          <p className="text-muted mt-2 text-sm">
            Товары этого бренда скоро появятся в каталоге.
          </p>
          <div className="mt-6">
            <Link href="/" className="text-olive underline underline-offset-4">
              В каталог
            </Link>
          </div>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.slug} className="mt-10">
            <RuledHeading>{group.name}</RuledHeading>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
              {group.products.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} showPrices={settings.showPrices} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function BrandSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-surface h-8 w-40 rounded-md" />
      <div className="mt-10">
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
