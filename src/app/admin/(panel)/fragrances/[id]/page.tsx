import { Suspense } from "react";

import { FragranceFormLoader } from "@/components/admin/FragranceFormLoader";

export const metadata = { title: "Аромат" };

export default function EditFragrancePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div aria-hidden className="bg-surface h-96 w-full rounded-md" />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FragranceFormLoader id={id} />;
}
