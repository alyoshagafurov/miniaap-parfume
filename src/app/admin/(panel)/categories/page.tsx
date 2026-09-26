import { Suspense } from "react";

import { CategoryList } from "@/components/admin/CategoryList";
import { listCategories } from "@/server/admin/dictionaries";

export const metadata = { title: "Категории" };

export default function CategoriesPage() {
  return (
    <>
      <h1 className="display-caps text-ink text-h1">Категории</h1>
      <p className="text-muted mt-3 text-sm leading-snug">
        Порядок здесь — порядок на главной витрины.
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
      <div className="bg-primary-wash h-11 w-48 rounded-full" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="stage h-28" />
      ))}
    </div>
  );
}
