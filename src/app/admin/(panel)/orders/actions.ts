"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ORDER_STATUSES } from "@/lib/orders";
import { setOrderStatus } from "@/server/admin/orders";
import { requirePermission } from "@/server/auth/roles";

/**
 * Changing a request's status.
 *
 * The check is here as well as inside setOrderStatus, and the repetition is the
 * point: a Server Action is a public POST endpoint, and this was the one action
 * in the panel whose only guard lived a layer down. That works until somebody
 * edits the layer down. check:action-guards now refuses the pattern outright.
 *
 * Beyond that this layer only parses, and then tells Next what is stale — the
 * list, the card, and the admin home, whose «новые заявки» counter is the
 * number the owner reads first in the morning.
 */
const Input = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(ORDER_STATUSES),
});

export type StatusResult = { ok: true } | { ok: false; message: string };

export async function changeOrderStatus(input: unknown): Promise<StatusResult> {
  await requirePermission("orders:write");

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
