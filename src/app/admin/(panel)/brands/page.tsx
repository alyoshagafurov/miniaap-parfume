import { Suspense } from "react";

import { BrandList } from "@/components/admin/BrandList";
import { listBrands } from "@/server/admin/dictionaries";

export const metadata = { title: "Бренды" };

export default function BrandsPage() {
  return (
    <>
      <h1 className="display-caps text-ink text-h1">Бренды</h1>
      <p className="text-muted mt-2 text-sm">
        Алиасы — то, как бренд набирают по-русски. Без них поиск «шанель» не найдёт
        Chanel.
      </p>
      <div className="mt-6">
        <Suspense fallback={<ListSkeleton />}>
          <List />
        </Suspense>
      </div>
    </>
  );
}

async function List() {
  return <BrandList brands={await listBrands()} />;
}

function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-surface h-14 w-full rounded-md" />
      ))}
    </div>
  );
}
