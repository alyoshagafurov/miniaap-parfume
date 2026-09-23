"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  createFragranceInline,
  findFragrances,
} from "@/app/admin/(panel)/products/actions";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

export interface PickedFragrance {
  id: string;
  name: string;
  brandName: string;
}

/**
 * Choosing the fragrance a bottle contains.
 *
 * Searched, not listed. Thirty fragrances today and several hundred once the
 * real range is entered, and a select with several hundred options is a select
 * nobody uses.
 *
 * A fragrance can be created without leaving the form, with only its brand and
 * its name. The notes, the families and the description belong to the fragrance
 * screen; asking for them here would turn adding one product into filling in
 * two forms, which is how a catalog ends up with three slightly different
 * descriptions of the same scent.
 */
export function FragrancePicker({
  value,
  onChange,
  brands,
}: {
  /** Position 0 names the product; position 1 exists only for a twin. */
  value: PickedFragrance[];
  onChange: (next: PickedFragrance[]) => void;
  brands: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PickedFragrance[]>([]);
  const [searching, startSearch] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newBrandId, setNewBrandId] = useState(brands[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingCreate, startCreate] = useTransition();

  // Debounced, and the request is fired from an effect rather than from the
  // keystroke: a Server Action per character on a market-floor connection
  // produces a queue of stale answers arriving after the one that matters.
  const latest = useRef(0);
  useEffect(() => {
    const token = ++latest.current;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await findFragrances({ query });
        // An answer to a query the administrator has already typed past must
        // not replace the list under them.
        if (token === latest.current) setOptions(found);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const add = (fragrance: PickedFragrance) => {
    if (value.some((f) => f.id === fragrance.id)) return;
    if (value.length >= 2) return;
    onChange([...value, fragrance]);
    setQuery("");
  };

  const create = () => {
    setError(null);
    startCreate(async () => {
      const result = await createFragranceInline({
        brandId: newBrandId,
        name: newName,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const brandName = brands.find((b) => b.id === newBrandId)?.name ?? "";
      add({ id: result.id, name: result.name, brandName });
      setCreating(false);
      setNewName("");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="caps text-muted mb-2 block">Ароматы</span>
        {value.length === 0 ? (
          <p className="text-muted text-sm">Пока не выбран ни один.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {value.map((fragrance, index) => (
              <li
                key={fragrance.id}
                className="border-rule bg-surface flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="text-ink block text-sm">
                    {fragrance.brandName} {fragrance.name}
                  </span>
                  <span className="text-muted text-xs">
                    {index === 0
                      ? "основной — им назван товар"
                      : "второй аромат двойняшки"}
                  </span>
                </span>
                <Button
                  variant="quiet"
                  type="button"
                  onClick={() => onChange(value.filter((f) => f.id !== fragrance.id))}
                >
                  Убрать
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {value.length < 2 ? (
        <div>
          <Field label="Найти аромат" htmlFor="fragrance-search">
            <TextInput
              id="fragrance-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Бренд или название"
            />
          </Field>

          <ul className="border-rule mt-2 max-h-64 overflow-y-auto rounded-md border">
            {options
              .filter((o) => !value.some((f) => f.id === o.id))
              .map((option) => (
                <li key={option.id} className="border-rule border-b last:border-b-0">
                  <button
                    type="button"
                    onClick={() => add(option)}
                    className="hover:bg-olive-wash flex min-h-11 w-full items-center px-3 text-left text-sm transition-colors"
                  >
                    <span className="text-muted">{option.brandName}</span>
                    <span className="text-ink ml-2">{option.name}</span>
                  </button>
                </li>
              ))}
            {options.length === 0 && !searching ? (
              <li className="text-muted px-3 py-3 text-sm">
                {query ? "Ничего не нашлось" : "Начните вводить название"}
              </li>
            ) : null}
          </ul>

          {creating ? (
            <div className="border-control mt-3 flex flex-col gap-3 rounded-md border p-3">
              <Field label="Бренд" htmlFor="new-fragrance-brand">
                <select
                  id="new-fragrance-brand"
                  value={newBrandId}
                  onChange={(e) => setNewBrandId(e.target.value)}
                  className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
                >
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Название аромата"
                htmlFor="new-fragrance-name"
                error={error ?? undefined}
              >
                <TextInput
                  id="new-fragrance-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  invalid={!!error}
                />
              </Field>

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={create}
                  loading={pendingCreate}
                  disabled={!newName.trim()}
                >
                  Создать и выбрать
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setCreating(false)}
                >
                  Отмена
                </Button>
              </div>
              <p className="text-muted text-xs">
                Ноты, семейства и описание добавите на экране аромата — там их видно
                целиком.
              </p>
            </div>
          ) : (
            <div className="mt-3">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCreating(true)}
              >
                Нет в списке — создать
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted text-sm">
          Два аромата — это двойняшка. Больше двух в одном флаконе не бывает.
        </p>
      )}
    </div>
  );
}
