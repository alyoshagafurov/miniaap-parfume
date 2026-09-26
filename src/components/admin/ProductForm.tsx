"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import {
  copyProduct,
  removeProduct,
  saveProduct,
} from "@/app/admin/(panel)/products/actions";
import {
  FragrancePicker,
  type PickedFragrance,
} from "@/components/admin/FragrancePicker";
import { ImageManager, type ManagedImage } from "@/components/admin/ImageManager";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import {
  PUBLISH_STATUSES,
  PUBLISH_STATUS_LABELS,
  STOCK_LABELS,
  STOCK_STATES,
  type PublishStatusName,
  type StockStateName,
} from "@/lib/admin-products";
import { parsePriceToKop } from "@/lib/money";

export interface ProductFormValues {
  categoryId: string;
  sku: string;
  title: string;
  slug: string;
  volume: string;
  price: string;
  oldPrice: string;
  packSize: string;
  stock: StockStateName;
  status: PublishStatusName;
  isNew: boolean;
  isHit: boolean;
  popularity: string;
}

export interface ProductFormProps {
  productId: string | null;
  initial: ProductFormValues;
  initialFragrances: PickedFragrance[];
  images: ManagedImage[];
  categories: ReadonlyArray<{ id: string; name: string }>;
  brands: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * The product form.
 *
 * react-hook-form through a transition, not `<form action={...}>`: React resets
 * an action form unconditionally and before the action is invoked, so a refusal
 * — a taken article, an old price below the new one — would empty a form
 * somebody spent two minutes filling. Every field here survives every outcome.
 *
 * Prices are typed in roubles and stored in kopecks, through the same parser
 * the Excel import uses, so «1 250,50» means the same thing in both places.
 *
 * Title and slug are generated and shown as placeholders rather than filled in.
 * An empty field that shows what will be used says "this is automatic, and you
 * may override it"; a pre-filled one says "somebody typed this", and the next
 * person edits the fragrance name and wonders why the title did not follow.
 */
export function ProductForm({
  productId,
  initial,
  initialFragrances,
  images,
  categories,
  brands,
}: ProductFormProps) {
  const router = useRouter();
  const form = useForm<ProductFormValues>({ defaultValues: initial });
  const [fragrances, setFragrances] = useState<PickedFragrance[]>(initialFragrances);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const generatedTitle =
    fragrances.length > 0
      ? `${fragrances[0]?.brandName ?? ""} ${fragrances.map((f) => f.name).join(" + ")}`.trim()
      : "Бренд Аромат";

  const submit = form.handleSubmit((values) => {
    setNotice(null);
    setSaved(false);

    if (fragrances.length === 0) {
      setNotice("Выберите хотя бы один аромат");
      return;
    }

    let priceKop: number;
    let oldPriceKop: number | null = null;
    try {
      priceKop = parsePriceToKop(values.price);
      if (values.oldPrice.trim()) oldPriceKop = parsePriceToKop(values.oldPrice);
    } catch {
      setNotice("Цена должна быть числом, например 1 250 или 1250,50");
      return;
    }

    startTransition(async () => {
      const result = await saveProduct({
        id: productId,
        product: {
          categoryId: values.categoryId,
          fragranceIds: fragrances.map((f) => f.id),
          sku: values.sku,
          title: values.title.trim() || null,
          slug: values.slug.trim() || null,
          volumeMl: Number(values.volume),
          priceKop,
          oldPriceKop,
          packSize: Number(values.packSize),
          stock: values.stock,
          status: values.status,
          isNew: values.isNew,
          isHit: values.isHit,
          popularity: Number(values.popularity || 0),
        },
      });

      if (!result.ok) {
        setNotice(result.message);
        return;
      }
      setSaved(true);
      // A new product becomes an existing one: without this the next save
      // would create a second row with the same article and be refused.
      if (!productId) router.replace(`/admin/products/${result.id}`);
      else router.refresh();
    });
  });

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p
          role="alert"
          className="border-danger bg-danger-wash text-ink rounded-md border p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}
      {saved ? (
        <p
          role="status"
          className="bg-night text-on-night rounded-md p-4 text-sm font-semibold"
        >
          Сохранено. Витрина уже показывает новые данные.
        </p>
      ) : null}

      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <section className="stage p-5">
          <FragrancePicker
            value={fragrances}
            onChange={setFragrances}
            brands={brands}
          />
        </section>

        <section className="stage grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Категория" htmlFor="categoryId">
            <select
              id="categoryId"
              {...form.register("categoryId", { required: true })}
              className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Артикул"
            htmlFor="sku"
            error={form.formState.errors.sku?.message}
            hint="Тот же, что на складе — по нему идёт импорт"
          >
            <TextInput
              id="sku"
              invalid={!!form.formState.errors.sku}
              {...form.register("sku", { required: "Укажите артикул" })}
            />
          </Field>

          <Field
            label="Объём, мл"
            htmlFor="volume"
            error={form.formState.errors.volume?.message}
          >
            <TextInput
              id="volume"
              inputMode="numeric"
              invalid={!!form.formState.errors.volume}
              {...form.register("volume", {
                required: "Укажите объём",
                pattern: { value: /^\d+$/, message: "Целое число" },
              })}
            />
          </Field>

          <Field
            label="Кратность"
            htmlFor="packSize"
            hint="Сколько штук в упаковке. 1 — поштучно"
            error={form.formState.errors.packSize?.message}
          >
            <TextInput
              id="packSize"
              inputMode="numeric"
              invalid={!!form.formState.errors.packSize}
              {...form.register("packSize", {
                required: "Укажите кратность",
                pattern: { value: /^\d+$/, message: "Целое число" },
              })}
            />
          </Field>

          <Field
            label="Цена, ₽"
            htmlFor="price"
            error={form.formState.errors.price?.message}
          >
            <TextInput
              id="price"
              inputMode="decimal"
              invalid={!!form.formState.errors.price}
              {...form.register("price", { required: "Укажите цену" })}
            />
          </Field>

          <Field label="Наличие" htmlFor="stock">
            <select
              id="stock"
              {...form.register("stock")}
              className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
            >
              {STOCK_STATES.map((s) => (
                <option key={s} value={s}>
                  {STOCK_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Статус" htmlFor="status">
            <select
              id="status"
              {...form.register("status")}
              className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
            >
              {PUBLISH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PUBLISH_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-wrap gap-6 sm:col-span-2">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="accent-primary h-5 w-5"
                {...form.register("isNew")}
              />
              <span className="text-ink text-sm font-semibold">Новинка</span>
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="accent-primary h-5 w-5"
                {...form.register("isHit")}
              />
              <span className="text-ink text-sm font-semibold">Хит</span>
            </label>
          </div>
        </section>

        <details className="stage group">
          <summary className="text-ink flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 text-base font-bold [&::-webkit-details-marker]:hidden">
            Дополнительно
            <svg
              aria-hidden
              viewBox="0 0 14 8"
              className="text-ink h-2 w-3.5 shrink-0 transition-transform duration-150 ease-out group-open:rotate-180"
            >
              <path
                d="M1 1l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2">
            <Field
              label="Старая цена, ₽"
              htmlFor="oldPrice"
              hint="Необязательно. Показывается зачёркнутой и должна быть больше текущей"
            >
              <TextInput
                id="oldPrice"
                inputMode="decimal"
                {...form.register("oldPrice")}
              />
            </Field>

            <Field
              label="Популярность"
              htmlFor="popularity"
              hint="Чем больше, тем выше в списках"
            >
              <TextInput
                id="popularity"
                inputMode="numeric"
                {...form.register("popularity")}
              />
            </Field>
            <Field
              label="Название"
              htmlFor="title"
              hint="Пусто — соберётся из бренда и ароматов"
            >
              <TextInput
                id="title"
                placeholder={generatedTitle}
                {...form.register("title")}
              />
            </Field>
            <Field
              label="Адрес (slug)"
              htmlFor="slug"
              hint="Пусто — соберётся из названия и артикула"
            >
              <TextInput
                id="slug"
                placeholder="соберётся сам"
                {...form.register("slug")}
              />
            </Field>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" loading={pending}>
            Сохранить
          </Button>
          {productId ? (
            <DangerZone
              productId={productId}
              onDone={() => router.replace("/admin/products")}
            />
          ) : null}
        </div>
      </form>

      {productId ? (
        <>
          <div className="stage p-5">
            <ImageManager productId={productId} images={images} />
          </div>
          <div className="stage p-5">
            <CopyToFormat
              productId={productId}
              categories={categories}
              defaults={{
                categoryId: form.getValues("categoryId"),
                packSize: form.getValues("packSize"),
              }}
            />
          </div>
        </>
      ) : (
        <p className="text-muted text-sm">
          Фотографии и копию в другом формате можно добавить сразу после сохранения.
        </p>
      )}
    </div>
  );
}

/**
 * The same fragrance in another bottle.
 *
 * The pivot the catalog is built around: a house releases one scent in 35 ml,
 * 100 ml and a twin, and entering it three times from scratch is how three
 * slightly different descriptions of the same scent end up in the catalog.
 * Everything about the scent is shared by reference; only the bottle is asked
 * for again.
 */
function CopyToFormat({
  productId,
  categories,
  defaults,
}: {
  productId: string;
  categories: ReadonlyArray<{ id: string; name: string }>;
  defaults: { categoryId: string; packSize: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      categoryId: defaults.categoryId,
      sku: "",
      volume: "",
      price: "",
      packSize: defaults.packSize,
    },
  });

  if (!open) {
    return (
      <div>
        <span className="display-caps text-ink mb-2 block text-lg">Другой формат</span>
        <p className="text-muted mb-3 text-sm">
          Создать такой же товар в другом объёме — аромат, ноты и описание общие.
        </p>
        <Button variant="secondary" type="button" onClick={() => setOpen(true)}>
          Копия в другом формате
        </Button>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    setError(null);
    let priceKop: number;
    try {
      priceKop = parsePriceToKop(values.price);
    } catch {
      setError("Цена должна быть числом");
      return;
    }
    startTransition(async () => {
      const result = await copyProduct({
        id: productId,
        categoryId: values.categoryId,
        sku: values.sku,
        volumeMl: Number(values.volume),
        priceKop,
        packSize: Number(values.packSize),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Straight into the copy: it is a draft with no photographs, and that is
      // the next thing to do about it.
      router.push(`/admin/products/${result.id}`);
    });
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      <span className="display-caps text-ink text-lg">Копия в другом формате</span>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Категория" htmlFor="copy-category">
          <select
            id="copy-category"
            {...form.register("categoryId")}
            className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Новый артикул" htmlFor="copy-sku">
          <TextInput id="copy-sku" {...form.register("sku", { required: true })} />
        </Field>
        <Field label="Объём, мл" htmlFor="copy-volume">
          <TextInput
            id="copy-volume"
            inputMode="numeric"
            {...form.register("volume", { required: true })}
          />
        </Field>
        <Field label="Цена, ₽" htmlFor="copy-price">
          <TextInput
            id="copy-price"
            inputMode="decimal"
            {...form.register("price", { required: true })}
          />
        </Field>
        <Field label="Кратность" htmlFor="copy-pack">
          <TextInput
            id="copy-pack"
            inputMode="numeric"
            {...form.register("packSize", { required: true })}
          />
        </Field>
      </div>

      <p className="text-muted text-sm">
        Копия создаётся черновиком: у неё ещё нет фотографий.
      </p>

      <div className="flex gap-3">
        <Button type="submit" loading={pending}>
          Создать копию
        </Button>
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

/**
 * Deleting a product.
 *
 * Two steps, because it cannot be undone. Past requests survive — an order line
 * is a snapshot and its link is SetNull — but the catalog row is gone, and for
 * a product that simply stopped being stocked the right answer is «Архив».
 */
function DangerZone({ productId, onDone }: { productId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button variant="quiet" type="button" onClick={() => setConfirming(true)}>
        Удалить товар
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <span className="text-ink text-sm">Удалить навсегда?</span>
      <Button
        type="button"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeProduct({ id: productId });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            onDone();
          })
        }
      >
        Да, удалить
      </Button>
      <Button variant="secondary" type="button" onClick={() => setConfirming(false)}>
        Отмена
      </Button>
      {error ? (
        <span role="alert" className="text-danger text-sm">
          {error}
        </span>
      ) : null}
    </span>
  );
}
