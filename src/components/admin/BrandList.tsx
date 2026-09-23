"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeBrand, saveBrand } from "@/app/admin/(panel)/dictionaries-actions";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import type { BrandRow } from "@/server/admin/dictionaries";

/**
 * Brands.
 *
 * A dozen rows, edited in place. A list this short with fields this few does not
 * need a page of its own per row — that is two navigations to fix a typo in an
 * alias, and aliases are exactly the thing that gets fixed repeatedly, because
 * they are the Russian spellings buyers actually type.
 *
 * The count of fragrances is on every row. It is what makes deleting a decision
 * rather than a button: the mutation refuses a brand that still has any, and
 * knowing that before the click is better than being told after it.
 */
export function BrandList({ brands }: { brands: readonly BrandRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <BrandForm brand={null} onDone={() => setCreating(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            Новый бренд
          </Button>
        </div>
      )}

      <ul className="flex flex-col">
        {brands.map((brand) =>
          editing === brand.id ? (
            <li key={brand.id} className="border-rule border-b py-4">
              <BrandForm brand={brand} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={brand.id}
              className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-3"
            >
              <div className="min-w-0">
                <p className="text-ink text-base font-medium">
                  {brand.name}
                  {brand.isPublished ? null : (
                    <span className="text-muted ml-2 text-xs">скрыт</span>
                  )}
                </p>
                <p className="text-muted mt-0.5 text-xs">
                  /b/{brand.slug} ·{" "}
                  {brand.aliases.length > 0
                    ? `алиасы: ${brand.aliases.join(", ")}`
                    : "без алиасов — по-русски не найдут"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted text-sm tabular-nums">
                  {brand.fragranceCount} ароматов
                </span>
                <Link
                  href={`/admin/fragrances?brand=${brand.slug}`}
                  className="text-olive text-sm underline underline-offset-4"
                >
                  Ароматы
                </Link>
                <Button variant="quiet" onClick={() => setEditing(brand.id)}>
                  Править
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function BrandForm({ brand, onDone }: { brand: BrandRow | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(brand?.name ?? "");
  const [aliases, setAliases] = useState(brand?.aliases.join(", ") ?? "");
  const [sortOrder, setSortOrder] = useState(String(brand?.sortOrder ?? 0));
  const [isPublished, setPublished] = useState(brand?.isPublished ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveBrand({
        id: brand?.id ?? null,
        fields: {
          name,
          aliases,
          sortOrder: Number(sortOrder) || 0,
          isPublished,
          slug: brand?.slug ?? null,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="border-control flex flex-col gap-4 rounded-md border p-4">
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" htmlFor={`brand-name-${brand?.id ?? "new"}`}>
          <TextInput
            id={`brand-name-${brand?.id ?? "new"}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="Алиасы"
          htmlFor={`brand-aliases-${brand?.id ?? "new"}`}
          hint="Через запятую: шанель, шанел — так его ищут по-русски"
        >
          <TextInput
            id={`brand-aliases-${brand?.id ?? "new"}`}
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
        </Field>
        <Field label="Порядок" htmlFor={`brand-order-${brand?.id ?? "new"}`}>
          <TextInput
            id={`brand-order-${brand?.id ?? "new"}`}
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 self-end">
          <input
            type="checkbox"
            className="accent-olive h-5 w-5"
            checked={isPublished}
            onChange={(e) => setPublished(e.target.checked)}
          />
          <span className="text-ink text-sm">Показывать на витрине</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={pending} disabled={!name.trim()}>
          Сохранить
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Отмена
        </Button>

        {brand ? (
          confirmDelete ? (
            <>
              <span className="text-ink text-sm">Удалить бренд?</span>
              <Button
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeBrand({ id: brand.id });
                    if (!result.ok) {
                      setError(result.message);
                      setConfirmDelete(false);
                      return;
                    }
                    onDone();
                    router.refresh();
                  })
                }
                loading={pending}
              >
                Да
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Нет
              </Button>
            </>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
