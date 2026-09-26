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
import { GOODS, plural } from "@/lib/format";
import { objectUrl } from "@/lib/media";

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
        <p
          role="alert"
          className="border-danger bg-danger-wash text-ink rounded-md border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      {creating ? (
        <div className="stage p-5">
          <CategoryForm category={null} onDone={() => setCreating(false)} />
        </div>
      ) : (
        <div>
          <Button onClick={() => setCreating(true)}>Новая категория</Button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {categories.map((category, index) =>
          editing === category.id ? (
            <li key={category.id} className="stage p-5">
              <CategoryForm category={category} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={category.id} className="stage flex items-center gap-4 p-3">
              <Thumb coverKey={category.coverKey} />

              <div className="min-w-0 flex-1">
                <p className="text-ink text-base leading-snug font-bold sm:text-lg">
                  {category.name}
                </p>
                <p className="text-muted mt-1 text-sm tabular-nums">
                  {category.productCount} {plural(category.productCount, GOODS)}
                  {category.isPublished ? null : " · скрыта"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4">
                  <button
                    type="button"
                    onClick={() => setEditing(category.id)}
                    className="text-ink inline-flex min-h-11 items-center text-sm font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
                  >
                    Править
                  </button>
                  <Link
                    href={`/admin/products?category=${category.slug}`}
                    className="text-ink inline-flex min-h-11 items-center text-sm font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
                  >
                    Товары
                  </Link>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-1">
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
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/** The storefront's category picture, or its monogram when there is none. */
function Thumb({ coverKey }: { coverKey: string | null }) {
  return coverKey ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={objectUrl(coverKey)}
      alt=""
      width={64}
      height={80}
      className="bg-canvas h-20 w-16 shrink-0 rounded-md object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="bg-canvas flex h-20 w-16 shrink-0 items-center justify-center rounded-md"
    >
      <span className="font-wordmark text-wordmark/45 text-2xl leading-none">Á</span>
    </span>
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
      className="bg-canvas text-ink hover:bg-primary-wash disabled:text-muted h-11 w-11 shrink-0 rounded-full text-base font-bold transition-colors disabled:cursor-not-allowed"
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

  /**
   * The id to hang a photograph on.
   *
   * A new category has none until it is saved, and the upload route needs one —
   * so creating used to close the form and leave the owner to find the row
   * again to add a picture. Saving now keeps the form open and fills this in,
   * which is the same shape as products: create, then add photographs.
   */
  const [savedId, setSavedId] = useState<string | null>(category?.id ?? null);
  const [coverKey, setCoverKey] = useState<string | null>(category?.coverKey ?? null);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveCategory({
        id: category?.id ?? null,
        fields: {
          name,
          subtitle: subtitle || null,
          isPublished,
          slug: category?.slug ?? null,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      // Editing an existing one is finished business; a new one has just
      // acquired an id and no picture, so it stays open for the next step.
      if (category) onDone();
      else setSavedId(result.data.id);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" htmlFor={`cat-name-${key}`}>
          <TextInput
            id={`cat-name-${key}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="Подзаголовок"
          htmlFor={`cat-sub-${key}`}
          hint="Строка под названием на главной"
        >
          <TextInput
            id={`cat-sub-${key}`}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </Field>
      </div>

      <CategoryCover
        categoryId={savedId}
        coverKey={coverKey}
        onChange={(next) => {
          setCoverKey(next);
          router.refresh();
        }}
      />

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="accent-primary h-5 w-5"
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

/**
 * The category's photograph — the one thing the panel could not do.
 *
 * `setCategoryCover` has been in the mutations layer all along, described as
 * "set by the upload route after the file is stored", with no upload route to
 * do it. The home screen reads `coverKey` and falls back to the monogram, so
 * every category showed a monogram and nothing in the panel could change that.
 *
 * Direct to the Route Handler rather than through a Server Action, for the
 * reason the product uploader gives: an action's body is capped at 1 MB and a
 * photograph off a phone is several times that.
 *
 * Absent until the category has an id. A new one acquires it on save, and the
 * form stays open at that point precisely so this appears without hunting for
 * the row again.
 */
function CategoryCover({
  categoryId,
  coverKey,
  onChange,
}: {
  categoryId: string | null;
  coverKey: string | null;
  onChange: (key: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!categoryId) {
    return (
      <p className="text-muted text-sm">
        Фото можно добавить сразу после сохранения — форма останется открытой.
      </p>
    );
  }

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("categoryId", categoryId);
      body.append("file", file);
      const response = await fetch("/api/admin/category-cover", {
        method: "POST",
        body,
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Не удалось загрузить фото";
        setError(message);
        return;
      }
      onChange((payload as { key: string }).key);
    } catch {
      setError("Не удалось загрузить фото");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/category-cover?categoryId=${encodeURIComponent(categoryId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setError("Не удалось удалить фото");
        return;
      }
      onChange(null);
    } catch {
      setError("Не удалось удалить фото");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="caps text-muted">Фото категории</span>

      <div className="flex items-center gap-4">
        {coverKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectUrl(coverKey)}
            alt=""
            width={64}
            height={80}
            className="bg-canvas h-20 w-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="bg-canvas flex h-20 w-16 shrink-0 items-center justify-center rounded-md"
          >
            <span className="font-wordmark text-wordmark/45 text-2xl leading-none">
              Á
            </span>
          </span>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="border-control text-ink hover:bg-primary-wash inline-flex min-h-11 cursor-pointer items-center rounded-full border px-5 text-sm font-bold transition-colors">
            {coverKey ? "Заменить" : "Загрузить фото"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Cleared so choosing the same file twice fires change again.
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>

          {coverKey ? (
            <Button variant="quiet" onClick={() => void clear()} loading={busy}>
              Убрать
            </Button>
          ) : null}
        </div>
      </div>

      {busy ? <p className="text-muted text-sm">Загружается…</p> : null}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
