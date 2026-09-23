"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ORDER_STATUSES } from "@/lib/orders";
import { setOrderStatus } from "@/server/admin/orders";

/**
 * Changing a request's status.
 *
 * The permission check is inside setOrderStatus, where the write is. This layer
 * only parses, and then tells Next what is now stale — the list, the card, and
 * the admin home, whose «новые заявки» counter is the number the owner reads
 * first in the morning.
 */
const Input = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(ORDER_STATUSES),
});

export type StatusResult = { ok: true } | { ok: false; message: string };

export async function changeOrderStatus(input: unknown): Promise<StatusResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };

  try {
    await setOrderStatus(parsed.data.id, parsed.data.status);
  } catch {
    // Not authenticated, not permitted, or the row is gone. The manager's next
    // move is the same in all three, and naming which would tell an unprivileged
    // caller whether the order exists.
    return { ok: false, message: "Не удалось изменить статус" };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin");
  return { ok: true };
}
