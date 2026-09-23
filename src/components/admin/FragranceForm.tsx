"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeFragrance, saveFragrance } from "@/app/admin/(panel)/dictionaries-actions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { FAMILIES, FAMILY_LABELS, GENDERS, GENDER_LABELS } from "@/lib/list-url";
import type { FragranceDetail } from "@/server/admin/dictionaries";

/**
 * A fragrance.
 *
 * The scent, not the bottle: everything here is shared by every format it is
 * sold in, which is why changing a note changes three products at once and why
 * the formats are listed at the bottom rather than edited here.
 *
 * Notes are typed as a comma-separated line per tier. A tag editor with chips
 * and a plus button would be prettier and slower — this is filled from a
 * supplier's description that is already a comma-separated line, and pasting it
 * should be one action.
 */
export function FragranceForm({
  fragrance,
  brands,
}: {
  fragrance: FragranceDetail | null;
  brands: ReadonlyArray<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [brandId, setBrandId] = useState(fragrance?.brandId ?? brands[0]?.id ?? "");
  const [name, setName] = useState(fragrance?.name ?? "");
  const [aliases, setAliases] = useState(fragrance?.aliases.join(", ") ?? "");
  const [gender, setGender] = useState(fragrance?.gender ?? "UNISEX");
  const [families, setFamilies] = useState<string[]>(fragrance?.families ?? []);
  const [notesTop, setNotesTop] = useState(fragrance?.notesTop.join(", ") ?? "");
  const [notesHeart, setNotesHeart] = useState(fragrance?.notesHeart.join(", ") ?? "");
  const [notesBase, setNotesBase] = useState(fragrance?.notesBase.join(", ") ?? "");
  const [description, setDescription] = useState(fragrance?.description ?? "");

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveFragrance({
        id: fragrance?.id ?? null,
        fields: {
          brandId,
          name,
          slug: fragrance?.slug ?? null,
          aliases,
          gender,
          families,
          notesTop,
          notesHeart,
          notesBase,
          description: description || null,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      if (!fragrance) router.replace(`/admin/fragrances/${result.data.id}`);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="border-danger bg-danger-wash text-ink rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="border-olive bg-olive-wash text-ink rounded-md border p-3 text-sm">
          Сохранено. Товары этого аромата переиндексированы, витрина обновлена.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Бренд" htmlFor="brandId">
          <select
            id="brandId"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Название" htmlFor="name">
          <TextInput id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field
          label="Алиасы"
          htmlFor="aliases"
          hint="Через запятую. Так, как его ищут: «шанс», «chance eau»"
        >
          <TextInput id="aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>

        <Field label="Пол" htmlFor="gender">
          <select
            id="gender"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
          >
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <span className="caps text-muted mb-2 block">Семейства</span>
        <div className="flex flex-wrap gap-2">
          {FAMILIES.map((family) => (
            <Chip
              key={family}
              selected={families.includes(family)}
              onClick={() =>
                setFamilies((current) =>
                  current.includes(family)
                    ? current.filter((f) => f !== family)
                    : [...current, family],
                )
              }
            >
              {FAMILY_LABELS[family]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Верхние ноты" htmlFor="notesTop" hint="Через запятую">
          <TextInput id="notesTop" value={notesTop} onChange={(e) => setNotesTop(e.target.value)} />
        </Field>
        <Field label="Сердце" htmlFor="notesHeart" hint="Через запятую">
          <TextInput
            id="notesHeart"
            value={notesHeart}
            onChange={(e) => setNotesHeart(e.target.value)}
          />
        </Field>
        <Field label="База" htmlFor="notesBase" hint="Через запятую">
          <TextInput
            id="notesBase"
            value={notesBase}
            onChange={(e) => setNotesBase(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Описание"
        htmlFor="description"
        hint="Видно на карточке товара и участвует в поиске"
      >
        <TextArea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={pending} disabled={!name.trim() || !brandId}>
          Сохранить
        </Button>

        {fragrance ? (
          confirmDelete ? (
            <>
              <span className="text-ink text-sm">Удалить аромат?</span>
              <Button
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeFragrance({ id: fragrance.id });
                    if (!result.ok) {
                      setError(result.message);
                      setConfirmDelete(false);
                      return;
                    }
                    router.replace("/admin/fragrances");
                  })
                }
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

      {fragrance ? (
        <section className="border-rule border-t pt-6">
          <h2 className="caps text-muted">В каких форматах продаётся</h2>
          {fragrance.products.length === 0 ? (
            <p className="text-muted mt-2 text-sm">
              Пока ни в одном. Аромат существует, но купить его нельзя, пока нет товара.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col">
              {fragrance.products.map((product) => (
                <li key={product.id} className="border-rule border-b py-2 last:border-b-0">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="text-ink text-sm underline-offset-4 hover:underline"
                  >
                    {product.volumeMl} мл · {product.categoryName}
                  </Link>
                  <span className="text-muted ml-2 font-mono text-xs">{product.sku}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
