"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { listMyOrders, repeatOrder } from "@/app/(shop)/orders/actions";
import { useCart } from "@/components/shop/CartProvider";
import { useHaptics, useTelegram } from "@/components/telegram/provider";
import { Button } from "@/components/ui/Button";
import { GoldRule } from "@/components/ui/GoldRule";
import { formatDateTimeRu } from "@/lib/format";
import { formatRub } from "@/lib/money";
import type { HistoryOrder } from "@/server/orders/history";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

const DELIVERY_LABEL: Record<string, string> = {
  CDEK: "СДЭК",
  RUSSIAN_POST: "Почта России",
  TRANSPORT_COMPANY: "Транспортная компания",
  PICKUP: "Самовывоз",
};

/**
 * Past requests.
 *
 * Fetched from the client rather than rendered on the server, because the only
 * thing that identifies a buyer is the launch string Telegram hands to the
 * Mini App — it lives in the browser and is not a cookie, so the server has no
 * way to know who is asking until the client says so and signs for it.
 *
 * Outside Telegram this screen has nothing to show and says so plainly. A web
 * visitor is anonymous to us by construction; inventing a lookup by order
 * number would mean anyone who can count could read someone else's details.
 */
export function OrdersScreen({ showPrices }: { showPrices: boolean }) {
  const { ready, isTelegram, rawInitData } = useTelegram();
  const [orders, setOrders] = useState<HistoryOrder[] | null>(null);
  const [failed, setFailed] = useState(false);

  // The effect only fetches. Whether there is anything to fetch is a question
  // the render can answer from `ready` and `isTelegram`, and answering it with
  // setState here would be a cascading render for a fact already known.
  useEffect(() => {
    if (!ready || !isTelegram || !rawInitData) return;
    let cancelled = false;
    listMyOrders({ initDataRaw: rawInitData }).then(
      (result) => {
        if (!cancelled) setOrders(result);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready, isTelegram, rawInitData]);

  return (
    <>
      <h1 className="font-display text-ink text-h1 leading-tight font-semibold">Мои заявки</h1>
      <GoldRule className="mt-4 w-24" />

      {!ready ? (
        <ListSkeleton />
      ) : !isTelegram || !rawInitData ? (
        <NotInTelegram />
      ) : failed ? (
        <p role="alert" className="text-muted mt-8 text-sm">
          Не удалось загрузить заявки. Проверьте связь.
        </p>
      ) : orders === null ? (
        <ListSkeleton />
      ) : orders.length === 0 ? (
        <div className="mt-8">
          <p className="text-ink text-lg">Заявок пока нет</p>
          <p className="text-muted mt-2 text-sm">
            Здесь появятся ваши заявки — с номером, датой и статусом.
          </p>
          <div className="mt-6">
            <Link href="/" className="text-olive underline underline-offset-4">
              В каталог
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {(orders ?? []).map((order) => (
            <li key={order.id}>
              <OrderCard order={order} showPrices={showPrices} initDataRaw={rawInitData} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function OrderCard({
  order,
  showPrices,
  initDataRaw,
}: {
  order: HistoryOrder;
  showPrices: boolean;
  initDataRaw: string | undefined;
}) {
  const router = useRouter();
  const { replace } = useCart();
  const haptics = useHaptics();
  const [pending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[] | null>(null);

  const repeat = () => {
    if (!initDataRaw) return;
    startTransition(async () => {
      const result = await repeatOrder({ initDataRaw, orderId: order.id });
      if (result.lines.length === 0) {
        haptics.error();
        setMissing(result.unavailable.map((u) => u.title));
        return;
      }
      haptics.success();
      // Replaces rather than merges: «Повторить» means this order, and silently
      // adding it on top of whatever was already in the basket would produce a
      // request the buyer did not assemble.
      replace(result.lines);
      setMissing(result.unavailable.map((u) => u.title));
      if (result.unavailable.length === 0) router.push("/cart");
    });
  };

  return (
    <article className="border-rule rounded-md border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink text-base font-semibold tabular-nums">№ {order.number}</h2>
        <span className="text-muted text-sm">{STATUS_LABEL[order.status] ?? order.status}</span>
      </div>

      <p className="text-muted mt-1 text-sm">
        {formatDateTimeRu(order.createdAt)} · {DELIVERY_LABEL[order.delivery] ?? order.delivery}
        {order.city ? ` · ${order.city}` : ""}
      </p>

      <ul className="mt-3 flex flex-col gap-1">
        {order.items.map((item) => (
          <li key={item.sku} className="text-muted flex justify-between gap-3 text-sm">
            <span className="min-w-0">
              {item.brandName} {item.title} · {item.format}
            </span>
            <span className="shrink-0 tabular-nums">×{item.qty}</span>
          </li>
        ))}
      </ul>

      {showPrices ? (
        <p className="border-rule text-ink mt-3 border-t pt-3 text-base font-semibold tabular-nums">
          {formatRub(order.totalKop)}
        </p>
      ) : null}

      {missing && missing.length > 0 ? (
        <p role="status" className="text-danger mt-3 text-sm">
          Сейчас недоступно: {missing.join(", ")}.
          {missing.length > 0 ? " Остальное перенесли в заявку." : ""}
        </p>
      ) : null}

      <div className="mt-4">
        <Button variant="secondary" onClick={repeat} loading={pending} disabled={!initDataRaw}>
          Повторить
        </Button>
      </div>
    </article>
  );
}

function NotInTelegram() {
  return (
    <div className="mt-8">
      <p className="text-ink text-lg">Заявки хранятся в Telegram</p>
      <p className="text-muted mt-2 text-sm">
        Мы узнаём вас по аккаунту Telegram, поэтому история видна в мини-приложении.
        Откройте каталог через бота — и все заявки будут здесь.
      </p>
      <div className="mt-6">
        <Link href="/" className="text-olive underline underline-offset-4">
          В каталог
        </Link>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="mt-8 flex flex-col gap-6">
      {[0, 1].map((i) => (
        <div key={i} className="border-rule rounded-md border p-4">
          <div className="bg-surface h-5 w-32 rounded-md" />
          <div className="bg-surface mt-2 h-4 w-48 rounded-md" />
          <div className="bg-surface mt-4 h-4 w-full rounded-md" />
          <div className="bg-surface mt-2 h-4 w-3/4 rounded-md" />
          <div className="bg-surface mt-4 h-11 w-32 rounded-md" />
        </div>
      ))}
    </div>
  );
}
