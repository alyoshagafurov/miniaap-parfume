"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logout } from "@/app/admin/login/actions";
import { Button } from "@/components/ui/Button";

/** Ends the session and returns to the way in. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await logout();
          router.replace("/admin/login");
          router.refresh();
        })
      }
    >
      Выйти
    </Button>
  );
}
