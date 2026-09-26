import { Suspense } from "react";

import { AdminList } from "@/components/admin/AdminList";
import { listAdmins } from "@/server/admin/admins";
import { requireAdminPage } from "@/server/auth/roles";

export const metadata = { title: "Админы" };

export default function AdminsPage() {
  return (
    <>
      <h1 className="display-caps text-ink text-h1">Админы</h1>
      <p className="text-muted mt-3 text-sm leading-snug">
        Кто может входить в панель. Отключённый теряет доступ сразу.
      </p>
      <div className="mt-6">
        <Suspense fallback={<div aria-hidden className="stage h-64 w-full" />}>
          <List />
        </Suspense>
      </div>
    </>
  );
}

async function List() {
  const session = await requireAdminPage("admins:write");
  return <AdminList admins={await listAdmins()} currentId={session.adminId} />;
}
