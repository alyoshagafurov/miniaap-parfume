"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { changeOrderStatus } from "@/app/admin/(panel)/orders/actions";
import { Chip } from "@/components/ui/Chip";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/orders";

/**
 * Moving a request along.
 *
 * Two shapes, because the two places are not the same job. On one request
 * there is room for four chips and one tap does it. In a list of thirty there
 * is not: four chips per row is a hundred and twenty targets on a 390 screen,
 * which is not a list any more. There it is a select — one line, one control.
 *
 * The chosen status shows immediately and rolls back if the server refuses, so
 * neither shape sits still for the length of a round trip on a market floor.
 */
export function OrderStatusControl({
  id,
  status,
  variant = "chips",
}: {
  id: string;
  status: OrderStatus;
  variant?: "chips" | "select";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState<OrderStatus>(status);
  const [failed, setFailed] = useState(false);

  // The server is the truth: when the row comes back with a different status
  // than the one on screen, take it.
  const [seen, setSeen] = useState(status);
  if (seen !== status) {
    setSeen(status);
    setShown(status);
  }

  const change = (next: OrderStatus) => {
    if (next === shown || pending) return;
    const previous = shown;
    setShown(next);
    setFailed(false);
    startTransition(async () => {
      const result = await changeOrderStatus({ id, status: next });
      if (!result.ok) {
        setShown(previous);
        setFailed(true);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div>
      {variant === "select" ? (
        <>
          <label htmlFor={`status-${id}`} className="sr-only">
            Статус заявки
          </label>
          <select
            id={`status-${id}`}
            value={shown}
            disabled={pending}
            onChange={(e) => change(e.target.value as OrderStatus)}
            className="bg-surface text-ink border-control rounded-md border px-3 text-sm"
          >
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Статус заявки">
          {ORDER_STATUSES.map((value) => (
            <Chip
              key={value}
              selected={shown === value}
              disabled={pending}
              onClick={() => change(value)}
            >
              {ORDER_STATUS_LABELS[value]}
            </Chip>
          ))}
        </div>
      )}

      {failed ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          Не удалось изменить статус. Проверьте связь и права.
        </p>
      ) : null}
    </div>
  );
}
