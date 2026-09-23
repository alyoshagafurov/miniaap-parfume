"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { submitOrder } from "@/app/(shop)/cart/actions";
import { CartLines } from "@/components/shop/CartLines";
import { ChangesPanel } from "@/components/shop/ChangesPanel";
import { useCart } from "@/components/shop/CartProvider";
import {
  useBackButton,
  useHaptics,
  useMainButton,
  useRequestPhone,
  useTelegram,
} from "@/components/telegram/provider";
import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { GoldRule } from "@/components/ui/GoldRule";
import { applyCorrections, toOrderItems } from "@/lib/cart";
import { formatRub } from "@/lib/money";
import type { CreateOrderResult } from "@/server/orders/create";

/**
 * The request.
 *
 * One screen: what is being ordered, what it comes to, and who to call about
 * it. Splitting the basket from the form would mean a buyer on a market floor
 * navigating between two pages to check one number against another.
 *
 * The form is react-hook-form driven and submitted through a transition, not
 * through `<form action={...}>`. React resets an action form unconditionally,
 * before the action is even invoked — so a rejected submission, a rate limit,
 * or a dropped connection would empty the name, phone, city and comment of
 * someone who did everything right. Here the fields are component state and
 * survive every outcome, which is the whole point.
 */

const DELIVERY = [
  { value: "CDEK", label: "СДЭК" },
  { value: "RUSSIAN_POST", label: "Почта России" },
  { value: "TRANSPORT_COMPANY", label: "Транспортная компания" },
  { value: "PICKUP", label: "Самовывоз с рынка" },
] as const;

interface FormValues {
  name: string;
  phone: string;
  city: string;
  delivery: (typeof DELIVERY)[number]["value"];
  comment: string;
  consent: boolean;
  website: string;
}

export function OrderScreen({
  minOrderKop,
  showPrices,
  pickupAddress,
}: {
  minOrderKop: number;
  showPrices: boolean;
  pickupAddress: string;
}) {
  const { lines, totalKop, count, replace, clear } = useCart();
  const { ready, isTelegram, rawInitData } = useTelegram();
  const requestPhone = useRequestPhone();
  const haptics = useHaptics();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateOrderResult | null>(null);
  const [done, setDone] = useState<{ number: string; totalKop: number } | null>(null);
  const [phonePending, setPhonePending] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      phone: "",
      city: "",
      delivery: "CDEK",
      comment: "",
      consent: false,
      website: "",
    },
  });

  const shortfall = Math.max(0, minOrderKop - totalKop);
  const meetsMinimum = !showPrices || shortfall === 0;
  const canSubmit = count > 0 && meetsMinimum && !pending;

  const send = useCallback(
    (values: FormValues, items: ReturnType<typeof toOrderItems>) => {
      startTransition(async () => {
        try {
          const outcome = await submitOrder({
            ...values,
            consent: values.consent,
            items,
            initDataRaw: rawInitData,
          });

          if (outcome.ok) {
            haptics.success();
            setResult(null);
            setDone({ number: outcome.number, totalKop: outcome.totalKop });
            clear();
            return;
          }

          haptics.error();
          setResult(outcome);
          // Field errors from the server go back onto the fields, so the buyer
          // is corrected where they typed rather than in a paragraph above.
          for (const [field, message] of Object.entries(outcome.fieldErrors ?? {})) {
            if (field in values) {
              form.setError(field as keyof FormValues, { type: "server", message });
            }
          }
        } catch {
          // A dropped connection. Everything typed is still on screen.
          haptics.error();
          setResult({
            ok: false,
            reason: "VALIDATION",
            message: "Не удалось отправить. Проверьте связь и попробуйте ещё раз.",
          });
        }
      });
    },
    [rawInitData, haptics, clear, form],
  );

  const onSubmit = form.handleSubmit((values) => send(values, toOrderItems(lines)));

  // Bringing a refusal into view belongs in an effect, not in the submit
  // handler: the handler is built during render, and a ref read from there is
  // a ref read during render. No smooth behaviour — the direction allows motion
  // on sheets and modals, and a scrolling page is neither.
  useEffect(() => {
    if (result && !result.ok) panel.current?.scrollIntoView({ block: "center" });
  }, [result]);

  // Telegram's own submit button, gated on the provider's ready flag — nothing
  // here touches it before the SDK has mounted.
  useMainButton({
    text: showPrices ? `Оформить · ${formatRub(totalKop)}` : "Оформить заявку",
    visible: !done && count > 0,
    enabled: canSubmit,
    loading: pending,
    onClick: useCallback(() => void onSubmit(), [onSubmit]),
  });

  useBackButton(null);

  /** Accept what the server corrected, then send the same form again. */
  const acceptChanges = () => {
    if (!result || result.ok || result.reason !== "CHANGED" || !result.correctedLines) return;
    const corrected = applyCorrections(lines, result.correctedLines);
    replace(corrected);
    setResult(null);
    void form.handleSubmit((values) => send(values, toOrderItems(corrected)))();
  };

  const fillPhoneFromTelegram = async () => {
    setPhonePending(true);
    try {
      const phone = await requestPhone();
      if (phone) {
        form.setValue("phone", formatPhone(phone), { shouldValidate: true });
        form.clearErrors("phone");
      }
    } finally {
      setPhonePending(false);
    }
  };

  if (done) {
    return (
      <section className="py-8 text-center">
        <h1 className="font-display text-ink text-h1 leading-tight font-semibold">
          Заявка принята
        </h1>
        <GoldRule className="mx-auto mt-4 w-24" />
        <p className="text-ink mt-6 text-lg tabular-nums">№ {done.number}</p>
        {showPrices ? (
          <p className="text-muted mt-1 tabular-nums">{formatRub(done.totalKop)}</p>
        ) : null}
        <p className="text-muted mt-6 text-sm">
          Менеджер свяжется с вами. Заявка сохранена в разделе «Мои заявки».
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link href="/orders" className="text-olive underline underline-offset-4">
            Мои заявки
          </Link>
          <Link href="/" className="text-olive underline underline-offset-4">
            Вернуться в каталог
          </Link>
        </div>
      </section>
    );
  }

  if (count === 0) {
    return (
      <section className="py-12 text-center">
        {/* Every state of this screen needs its heading, not only the one that
            happens to have items in it. */}
        <h1 className="text-ink text-lg">В заявке пока пусто</h1>
        <p className="text-muted mt-2 text-sm">
          Добавьте товары из каталога — минимальный заказ {formatRub(minOrderKop)}.
        </p>
        <div className="mt-8 flex justify-center">
          <Link href="/" className="text-olive underline underline-offset-4">
            В каталог
          </Link>
        </div>
      </section>
    );
  }

  const changed = result && !result.ok && result.reason === "CHANGED";

  return (
    <>
      <h1 className="font-display text-ink text-h1 leading-tight font-semibold">Заявка</h1>
      <GoldRule className="mt-4 w-24" />

      <div className="mt-6">
        <CartLines showPrices={showPrices} />
      </div>

      {showPrices ? (
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink text-base">Итого</span>
            <span className="text-ink text-h2 font-semibold tabular-nums">
              {formatRub(totalKop)}
            </span>
          </div>
          <MinimumProgress totalKop={totalKop} minOrderKop={minOrderKop} />
        </div>
      ) : (
        <p className="text-muted mt-6 text-sm">
          Сумму подтвердит менеджер — цены в каталоге скрыты.
        </p>
      )}

      <div ref={panel} className="mt-8 flex flex-col gap-4">
        {changed && !result.ok ? (
          <>
            <ChangesPanel
              changes={result.changes ?? []}
              totalKop={result.totalKop ?? 0}
              previousTotalKop={result.previousTotalKop ?? 0}
              showPrices={showPrices}
            />
            <Button onClick={acceptChanges} loading={pending}>
              Принять и отправить
            </Button>
          </>
        ) : null}

        {result && !result.ok && !changed ? (
          <p role="alert" className="border-danger bg-danger-wash text-ink rounded-md border p-4 text-sm">
            {result.message}
          </p>
        ) : null}
      </div>

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-8 flex flex-col gap-5">
        <Field label="Имя" htmlFor="name" error={form.formState.errors.name?.message}>
          <TextInput
            id="name"
            autoComplete="name"
            invalid={!!form.formState.errors.name}
            {...form.register("name", {
              required: "Укажите имя",
              minLength: { value: 2, message: "Слишком коротко" },
            })}
          />
        </Field>

        <Field
          label="Телефон"
          htmlFor="phone"
          error={form.formState.errors.phone?.message}
          hint="+7 (___) ___-__-__"
        >
          <TextInput
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 (900) 000-00-00"
            invalid={!!form.formState.errors.phone}
            {...form.register("phone", {
              required: "Укажите телефон",
              validate: (value) =>
                /^\+7\d{10}$/.test(value.replace(/\D/g, "").replace(/^8/, "7").replace(/^7/, "+7"))
                  ? true
                  : "Неверный номер телефона",
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                form.setValue("phone", formatPhone(e.target.value));
              },
            })}
          />
        </Field>

        {ready && isTelegram ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => void fillPhoneFromTelegram()}
            loading={phonePending}
          >
            Поделиться номером
          </Button>
        ) : null}

        <Field label="Город" htmlFor="city" error={form.formState.errors.city?.message}>
          <TextInput
            id="city"
            autoComplete="address-level2"
            invalid={!!form.formState.errors.city}
            {...form.register("city", {
              required: "Укажите город",
              minLength: { value: 2, message: "Слишком коротко" },
            })}
          />
        </Field>

        <fieldset>
          <legend className="caps text-muted mb-2">Доставка</legend>
          <div className="flex flex-col gap-2">
            {DELIVERY.map((option) => (
              <label
                key={option.value}
                className="border-control bg-surface flex min-h-11 items-center gap-3 rounded-md border px-3 py-2"
              >
                <input
                  type="radio"
                  value={option.value}
                  className="accent-olive h-5 w-5"
                  {...form.register("delivery")}
                />
                <span className="text-ink text-base">{option.label}</span>
              </label>
            ))}
          </div>
          {pickupAddress ? (
            <p className="text-muted mt-2 text-xs">Самовывоз: {pickupAddress}</p>
          ) : null}
        </fieldset>

        <Field label="Комментарий" htmlFor="comment" error={form.formState.errors.comment?.message}>
          <TextArea id="comment" {...form.register("comment", { maxLength: 1000 })} />
        </Field>

        {/*
          Honeypot. Off-screen rather than display:none — a bot that reads
          computed styles skips a hidden field — and taken out of the tab order
          and the accessibility tree so no person ever reaches it.
        */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Сайт</label>
          <input id="website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
        </div>

        <div>
          {/* min-h-11: measured at 43px, one pixel under the floor. The box is
              20px; the label is the target. */}
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              className="accent-olive mt-0.5 h-5 w-5 shrink-0"
              {...form.register("consent", { required: "Нужно согласие на обработку данных" })}
            />
            <span className="text-muted text-sm">
              Согласен на обработку персональных данных для оформления заявки
            </span>
          </label>
          {form.formState.errors.consent ? (
            <p role="alert" className="text-danger mt-1 text-xs">
              {form.formState.errors.consent.message}
            </p>
          ) : null}
        </div>

        {!meetsMinimum ? (
          <p className="text-muted text-sm">
            До минимального заказа не хватает {formatRub(shortfall)}.
          </p>
        ) : null}

        {/*
          Rendered outside Telegram, where there is no MainButton — and also
          inside it, because the MainButton sits below the keyboard while the
          comment field is focused and a buyer who has just finished typing
          should not have to dismiss it to find the way forward.
        */}
        <Button type="submit" fullWidth disabled={!canSubmit} loading={pending}>
          {showPrices ? `Оформить · ${formatRub(totalKop)}` : "Оформить заявку"}
        </Button>
      </form>
    </>
  );
}

/**
 * How far the request is from the minimum.
 *
 * A bar rather than only a number, because "не хватает 1 200 ₽" says nothing
 * about whether that is nearly there or barely started.
 */
function MinimumProgress({ totalKop, minOrderKop }: { totalKop: number; minOrderKop: number }) {
  if (minOrderKop <= 0) return null;
  const pct = Math.min(100, Math.round((totalKop / minOrderKop) * 100));
  const short = Math.max(0, minOrderKop - totalKop);

  return (
    <div className="mt-3">
      <div
        className="bg-rule h-1 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Прогресс до минимального заказа"
      >
        {/* No transition. It declared transition-transform and animated width,
            so the class did nothing — and had it worked it would have animated
            a layout property, which the direction does not allow. Motion in
            this interface is sheets and modals; a progress bar snaps. */}
        <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted mt-2 text-sm">
        {short === 0
          ? `Минимальный заказ ${formatRub(minOrderKop)} — набран`
          : `До минимального заказа ${formatRub(minOrderKop)} не хватает ${formatRub(short)}`}
      </p>
    </div>
  );
}

/**
 * Formats as it is typed: +7 (900) 000-00-00.
 *
 * Buyers type 8, +7 or neither. All three become the same number, and the
 * server normalises again — this only makes the field readable while it is
 * being filled.
 */
function formatPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) digits = `7${digits}`;
  digits = digits.slice(0, 11);

  const rest = digits.slice(1);
  if (rest.length === 0) return "+7";
  if (rest.length <= 3) return `+7 (${rest}`;
  if (rest.length <= 6) return `+7 (${rest.slice(0, 3)}) ${rest.slice(3)}`;
  if (rest.length <= 8) return `+7 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  return `+7 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 8)}-${rest.slice(8)}`;
}
