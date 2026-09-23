import { Suspense } from "react";

import { ProductFormLoader } from "@/components/admin/ProductFormLoader";

export const metadata = { title: "Товар" };

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductFormLoader id={id} />;
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
