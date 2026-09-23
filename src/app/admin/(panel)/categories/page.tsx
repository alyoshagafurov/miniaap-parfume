import { Suspense } from "react";

import { CategoryList } from "@/components/admin/CategoryList";
import { listCategories } from "@/server/admin/dictionaries";

export const metadata = { title: "Категории" };

export default function CategoriesPage() {
  return (
    <>
      <h1 className="font-display text-ink text-h2 leading-tight font-semibold">Категории</h1>
      <p className="text-muted mt-2 text-sm">
        Это форматы: 35 мл, 100 мл, двойняшки, дезодоранты. Порядок здесь — порядок на главной.
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
  return <CategoryList categories={await listCategories()} />;
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
