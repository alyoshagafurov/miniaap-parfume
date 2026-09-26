import Link from "next/link";

import { FragranceForm } from "@/components/admin/FragranceForm";
import { getFragrance, listBrands } from "@/server/admin/dictionaries";

export async function FragranceFormLoader({ id }: { id: string | null }) {
  const [fragrance, brands] = await Promise.all([
    id ? getFragrance(id) : Promise.resolve(null),
    listBrands(),
  ]);

  if (id && !fragrance) {
    return (
      <div>
        <p className="text-ink text-lg">Аромат не найден</p>
        <Link
          href="/admin/fragrances"
          className="text-primary mt-4 inline-block underline underline-offset-4"
        >
          Ко всем ароматам
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href="/admin/fragrances"
          className="text-muted inline-flex min-h-11 items-center text-sm"
        >
          ← Все ароматы
        </Link>
        <h1 className="font-display text-ink text-h2 leading-tight font-semibold">
          {fragrance ? fragrance.name : "Новый аромат"}
        </h1>
      </div>
      <FragranceForm fragrance={fragrance} brands={brands} />
    </>
  );
}
