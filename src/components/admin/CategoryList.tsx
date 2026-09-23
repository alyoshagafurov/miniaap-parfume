"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  moveCategories,
  removeCategory,
  saveCategory,
} from "@/app/admin/(panel)/dictionaries-actions";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import type { CategoryRow } from "@/server/admin/dictionaries";

/**
 * Categories — the formats.
 *
 * Four of them, and their order is the order of the home screen, so it is
 * changed by hand. With arrows rather than by dragging: the owner reorders this
 * once a year from whatever device is nearby, and two buttons work with a
 * thumb, a keyboard and a screen reader, which a drag handle does not.
 *
 * The whole order is sent on every move, not a swap. A list of ids is a state
 * the server can apply exactly; a sequence of swaps is a state two clients can
 * disagree about.
 */
export function CategoryList({ categories }: { categories: readonly CategoryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const move = (index: number, delta: number) => {
    const next = [...categories];
    const target = index + delta;
    const moved = next[index];
    const displaced = next[target];
    if (!moved || !displaced) return;
    next[index] = displaced;
    next[target] = moved;

    startTransition(async () => {
      const result = await moveCategories({ ids: next.map((c) => c.id) });
      setError(result.ok ? null : result.message);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="border-danger bg-danger-wash text-ink rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}

      {creating ? (
        <CategoryForm category={null} onDone={() => setCreating(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            Новая категория
          </Button>
        </div>
      )}

      <ul className="flex flex-col">
        {categories.map((category, index) =>
          editing === category.id ? (
            <li key={category.id} className="border-rule border-b py-4">
              <CategoryForm category={category} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={category.id}
              className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Arrow
                  label={`Поднять «${category.name}»`}
                  disabled={index === 0 || pending}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Arrow>
                <Arrow
                  label={`Опустить «${category.name}»`}
                  disabled={index === categories.length - 1 || pending}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Arrow>
                <div className="min-w-0">
                  <p className="text-ink text-base font-medium">
                    {category.name}
                    {category.isPublished ? null : (
                      <span className="text-muted ml-2 text-xs">скрыта</span>
                    )}
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    /c/{category.slug}
                    {category.subtitle ? ` · ${category.subtitle}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-muted text-sm tabular-nums">
                  {category.productCount} товаров
                </span>
                <Link
                  href={`/admin/products?category=${category.slug}`}
                  className="text-olive text-sm underline underline-offset-4"
                >
                  Товары
                </Link>
                <Button variant="quiet" onClick={() => setEditing(category.id)}>
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

function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="border-control text-ink hover:bg-olive-wash disabled:text-muted h-11 w-9 shrink-0 rounded-md border transition-colors disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category: CategoryRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(category?.name ?? "");
  const [subtitle, setSubtitle] = useState(category?.subtitle ?? "");
  const [isPublished, setPublished] = useState(category?.isPublished ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const key = category?.id ?? "new";

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveCategory({
        id: category?.id ?? null,
        fields: { name, subtitle: subtitle || null, isPublished, slug: category?.slug ?? null },
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
        <Field label="Название" htmlFor={`cat-name-${key}`}>
          <TextInput id={`cat-name-${key}`} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Подзаголовок" htmlFor={`cat-sub-${key}`} hint="Строка под названием на главной">
          <TextInput
            id={`cat-sub-${key}`}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </Field>
      </div>

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="accent-olive h-5 w-5"
          checked={isPublished}
          onChange={(e) => setPublished(e.target.checked)}
        />
        <span className="text-ink text-sm">Показывать на витрине</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={pending} disabled={!name.trim()}>
          Сохранить
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Отмена
        </Button>

        {category ? (
          confirmDelete ? (
            <>
              <span className="text-ink text-sm">Удалить категорию?</span>
              <Button
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeCategory({ id: category.id });
                    if (!result.ok) {
                      setError(result.message);
                      setConfirmDelete(false);
                      return;
                    }
                    onDone();
                    router.refresh();
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
    </div>
  );
}
