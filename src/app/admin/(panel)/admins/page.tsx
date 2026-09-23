import { Suspense } from "react";

import { AdminList } from "@/components/admin/AdminList";
import { listAdmins } from "@/server/admin/admins";
import { requireAdminPage } from "@/server/auth/roles";

export const metadata = { title: "Админы" };

export default function AdminsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-h2 leading-tight font-semibold">Админы</h1>
      <p className="text-muted mt-2 text-sm">
        Присутствие здесь — это список допуска, но не пропуск: пароль нужен всегда, а из
        браузера ещё и код из Telegram.
      </p>
      <div className="mt-6">
        <Suspense fallback={<div aria-hidden className="bg-surface h-64 w-full rounded-md" />}>
          <List />
        </Suspense>
      </div>
    </>
  );
}

async function List() {
  const session = await requireAdminPage();
  return <AdminList admins={await listAdmins()} currentId={session.adminId} />;
}
