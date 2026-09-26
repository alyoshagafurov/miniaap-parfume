"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { updateSettings } from "@/app/admin/(panel)/settings/actions";
import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { ACCEPT_ATTRIBUTE } from "@/lib/images";
import { objectUrl } from "@/lib/media";

export interface SettingsValues {
  companyName: string;
  address: string;
  phone: string;
  whatsappPhone: string;
  minOrder: string;
  showPrices: boolean;
  deliveryTerms: string;
  botGreeting: string;
}

/**
 * Everything the client can change without a deploy.
 *
 * Nothing in this codebase hardcodes a contact detail; the storefront's footer,
 * the bot's greeting and the minimum order all read this row. Which is why the
 * two consequential fields say what they do rather than sitting there as a
 * number and a checkbox: raising the minimum changes what the next request is
 * judged against, and hiding prices changes every card on the storefront.
 */
export function SettingsForm({
  initial,
  bannerKey,
}: {
  initial: SettingsValues;
  bannerKey: string | null;
}) {
  const router = useRouter();
  const form = useForm<SettingsValues>({ defaultValues: initial });
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = form.handleSubmit((values) => {
    setNotice(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSettings(values);
      if (!result.ok) {
        setNotice(result.message);
        return;
      }
      setSaved(true);
      router.refresh();
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
          Сохранено. Витрина и бот уже отвечают по-новому.
        </p>
      ) : null}

      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <section className="stage flex flex-col gap-5 p-5">
          <h2 className="display-caps text-ink text-lg">Контакты</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Название" htmlFor="companyName">
              <TextInput
                id="companyName"
                {...form.register("companyName", { required: true })}
              />
            </Field>
            <Field
              label="Адрес"
              htmlFor="address"
              hint="Показывается на главной и в боте"
            >
              <TextInput id="address" {...form.register("address")} />
            </Field>
            <Field label="Телефон" htmlFor="phone">
              <TextInput id="phone" type="tel" {...form.register("phone")} />
            </Field>
            <Field
              label="WhatsApp"
              htmlFor="whatsappPhone"
              hint="Номер, на который ведёт кнопка"
            >
              <TextInput
                id="whatsappPhone"
                type="tel"
                {...form.register("whatsappPhone")}
              />
            </Field>
          </div>
        </section>

        <section className="stage flex flex-col gap-5 p-5">
          <h2 className="display-caps text-ink text-lg">Условия</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Минимальный заказ, ₽"
              htmlFor="minOrder"
              hint="По этой цифре заявка проходит или отклоняется — берётся свежая, не из кэша"
            >
              <TextInput
                id="minOrder"
                inputMode="decimal"
                {...form.register("minOrder")}
              />
            </Field>
            <div className="self-end">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-primary h-5 w-5"
                  {...form.register("showPrices")}
                />
                <span className="text-ink text-sm">Показывать цены</span>
              </label>
              <p className="text-muted mt-1 text-xs">
                Если выключить, на витрине будет «цена по запросу», а заявка соберётся
                без сумм и без проверки минимума.
              </p>
            </div>
          </div>

          <Field
            label="Условия доставки"
            htmlFor="deliveryTerms"
            hint="Текст на главной и в боте"
          >
            <TextArea id="deliveryTerms" {...form.register("deliveryTerms")} />
          </Field>
        </section>

        <section className="stage flex flex-col gap-5 p-5">
          <h2 className="display-caps text-ink text-lg">Приветствие бота</h2>
          <Field
            label="Текст"
            htmlFor="botGreeting"
            hint="Первое, что видит покупатель после /start"
          >
            <TextArea id="botGreeting" {...form.register("botGreeting")} />
          </Field>
        </section>

        <div className="pt-2">
          <Button type="submit" loading={pending}>
            Сохранить
          </Button>
        </div>
      </form>

      <section className="stage p-5">
        <Banner bannerKey={bannerKey} />
      </section>
    </div>
  );
}

/**
 * The picture above the greeting.
 *
 * Its own uploader rather than a field in the form, because it is a file and
 * the form is a Server Action — and because replacing it has a side effect the
 * form does not: the cached Telegram file_id is cleared, so the bot uploads the
 * new picture once instead of re-sending the old one by id forever.
 */
function Banner({ bannerKey }: { bannerKey: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (file: File) => {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch("/api/admin/banner", { method: "POST", body });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Не удалось загрузить");
        return;
      }
      router.refresh();
    } catch {
      setError("Нет связи");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/banner", { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="display-caps text-ink text-lg">Баннер приветствия</h2>

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      {bannerKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl(bannerKey)}
          alt="Текущий баннер приветствия"
          className="bg-canvas max-w-sm rounded-md"
        />
      ) : (
        <p className="text-muted text-sm">
          Баннера нет — бот поздоровается одним текстом.
        </p>
      )}

      {/* aria-hidden and out of the tab order: it is `sr-only`, not `hidden`,

      so without this a screen reader tabs onto an unlabelled file input

      beside the button that already does the job. One control, the visible

      one. */}
      <input
        ref={input}
        type="file"

        aria-hidden

        tabIndex={-1}
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void send(file);
        }}
      />
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          type="button"
          loading={busy}
          onClick={() => input.current?.click()}
        >
          {bannerKey ? "Заменить" : "Загрузить"}
        </Button>
        {bannerKey ? (
          <Button
            variant="quiet"
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            Убрать
          </Button>
        ) : null}
      </div>
    </div>
  );
}
