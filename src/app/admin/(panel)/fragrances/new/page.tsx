import { Suspense } from "react";

import { FragranceFormLoader } from "@/components/admin/FragranceFormLoader";

export const metadata = { title: "Новый аромат" };

export default function NewFragrancePage() {
  return (
    <Suspense fallback={<div aria-hidden className="bg-surface h-96 w-full rounded-md" />}>
      <FragranceFormLoader id={null} />
    </Suspense>
  );
}
