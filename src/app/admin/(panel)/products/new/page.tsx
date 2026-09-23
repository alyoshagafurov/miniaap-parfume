import { Suspense } from "react";

import { ProductFormLoader } from "@/components/admin/ProductFormLoader";

export const metadata = { title: "Новый товар" };

export default function NewProductPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <ProductFormLoader id={null} />
    </Suspense>
  );
}

function FormSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="bg-surface h-8 w-48 rounded-md" />
      <div className="bg-surface h-32 w-full rounded-md" />
      <div className="bg-surface h-64 w-full rounded-md" />
    </div>
  );
}
