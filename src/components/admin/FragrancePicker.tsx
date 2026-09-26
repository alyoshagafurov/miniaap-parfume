"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  createFragranceInline,
  findFragrances,
} from "@/app/admin/(panel)/products/actions";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { GENDER_LABELS, type Gender } from "@/lib/list-url";

export interface PickedFragrance {
  id: string;
  name: string;
  brandName: string;
}

/** In the order a person says them, not the enum's. */
const GENDER_CHOICES: readonly Gender[] = ["MALE", "FEMALE", "UNISEX"];

/**
 * Choosing the fragrance a bottle contains.
 *
 * Searched, not listed. Thirty fragrances today and several hundred once the
 * real range is entered, and a select with several hundred options is a select
 * nobody uses.
 *
 * A fragrance can be created without leaving the form, with its brand, its name
 * and who it is for. The notes, the families and the description belong to the
 * fragrance screen; asking for them here would turn adding one product into
 * filling in two forms, which is how a catalog ends up with three slightly
 * different descriptions of the same scent. Who it is for is the exception
 * because the storefront filters on it: a men's fragrance saved as unisex is
 * missing from «Мужской».
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
  const [newBrand, setNewBrand] = useState("");
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<Gender>("UNISEX");
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
        brandName: newBrand,
        name: newName,
        gender: newGender,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The brand's name as stored, not as typed: «chanel» comes back «Chanel».
      add({ id: result.id, name: result.name, brandName: result.brandName });
      setCreating(false);
      setNewName("");
      setNewBrand("");
      setNewGender("UNISEX");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="display-caps text-ink mb-4 block text-lg">Аромат</span>
        {value.length === 0 ? (
          <p className="text-muted text-sm">Пока не выбран ни один.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {value.map((fragrance, index) => (
              <li
                key={fragrance.id}
                className="bg-canvas flex items-center justify-between gap-3 rounded-md px-4 py-2"
              >
                <span className="min-w-0">
                  <span className="text-ink block text-sm font-bold">
                    {fragrance.brandName} {fragrance.name}
                  </span>
                  <span className="text-muted text-xs">
                    {index === 0
                      ? "основной — им назван товар"
                      : "второй аромат двойняшки"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <Link
                    href={`/admin/fragrances/${fragrance.id}`}
                    target="_blank"
                    className="text-muted hover:text-ink text-sm underline underline-offset-4"
                  >
                    Ноты
                  </Link>
                  <Button
                    variant="quiet"
                    type="button"
                    onClick={() => onChange(value.filter((f) => f.id !== fragrance.id))}
                  >
                    Убрать
                  </Button>
                </span>
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

          <ul className="bg-canvas mt-2 max-h-64 overflow-y-auto rounded-md">
            {options
              .filter((o) => !value.some((f) => f.id === o.id))
              .map((option) => (
                <li
                  key={option.id}
                  className="border-surface border-b-2 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => add(option)}
                    className="hover:bg-primary-wash flex min-h-11 w-full items-center px-3 text-left text-sm transition-colors"
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
            <div className="bg-canvas mt-3 flex flex-col gap-3 rounded-md p-4">
              <Field
                label="Бренд"
                htmlFor="new-fragrance-brand"
                hint="Выберите из подсказок или впишите новый — он создастся."
              >
                <TextInput
                  id="new-fragrance-brand"
                  list="new-fragrance-brands"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  placeholder="Например, Chanel"
                  autoComplete="off"
                />
                <datalist id="new-fragrance-brands">
                  {brands.map((b) => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
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

              <fieldset>
                <legend className="caps text-muted mb-2">Для кого</legend>
                <div className="flex flex-wrap gap-2">
                  {GENDER_CHOICES.map((gender) => (
                    <label
                      key={gender}
                      className="border-control bg-surface flex min-h-11 items-center gap-2 rounded-full border px-4"
                    >
                      <input
                        type="radio"
                        name="new-fragrance-gender"
                        value={gender}
                        checked={newGender === gender}
                        onChange={() => setNewGender(gender)}
                        className="accent-primary h-5 w-5"
                      />
                      <span className="text-ink text-sm font-semibold">
                        {GENDER_LABELS[gender]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Button
                  type="button"
                  onClick={create}
                  loading={pendingCreate}
                  disabled={!newName.trim() || !newBrand.trim()}
                >
                  Создать и выбрать
                </Button>
                <Button
                  variant="quiet"
                  type="button"
                  onClick={() => setCreating(false)}
                >
                  Отмена
                </Button>
              </div>
              <p className="text-muted text-xs">
                Ноты и описание — по ссылке «Ноты» у выбранного аромата, их можно
                дописать и позже.
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
