"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveAdmin, toggleAdmin } from "@/app/admin/(panel)/admins/actions";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { formatDateRu } from "@/lib/format";
import type { AdminRow } from "@/server/admin/admins";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец — всё",
  EDITOR: "Редактор — каталог и заявки",
};

/**
 * Who can get in.
 *
 * Two or three people, so they are listed and edited in place. Every row shows
 * its Telegram id, because that id is the allow-list: the Mini App login checks
 * the launch string against it and the browser login sends the code to it.
 *
 * Nobody is deleted, only switched off. The question "who changed this" only
 * has an answer while the row exists, and `isActive` is re-read from the
 * database on every request — so switching somebody off takes effect on their
 * next click, not when their cookie expires twelve hours later.
 */
export function AdminList({ admins, currentId }: { admins: readonly AdminRow[]; currentId: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <AdminForm admin={null} onDone={() => setCreating(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            Добавить администратора
          </Button>
        </div>
      )}

      <ul className="flex flex-col">
        {admins.map((admin) =>
          editing === admin.id ? (
            <li key={admin.id} className="border-rule border-b py-4">
              <AdminForm admin={admin} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={admin.id}
              className="border-rule flex flex-wrap items-center justify-between gap-3 border-b py-3"
            >
              <div className="min-w-0">
                <p className="text-ink text-base font-medium">
                  {admin.name}
                  <span className="text-muted ml-2 text-sm">{admin.login}</span>
                  {admin.id === currentId ? (
                    <span className="text-muted ml-2 text-xs">это вы</span>
                  ) : null}
                  {admin.isActive ? null : (
                    <span className="text-danger ml-2 text-xs">отключён</span>
                  )}
                </p>
                <p className="text-muted mt-0.5 text-xs tabular-nums">
                  Telegram ID {admin.telegramId} · {ROLE_LABELS[admin.role] ?? admin.role} ·
                  с {formatDateRu(admin.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="quiet" onClick={() => setEditing(admin.id)}>
                  Править
                </Button>
                <ActiveToggle admin={admin} disabled={admin.id === currentId} />
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function ActiveToggle({ admin, disabled }: { admin: AdminRow; disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-danger text-xs">
          {error}
        </span>
      ) : null}
      <Button
        variant="secondary"
        loading={pending}
        disabled={disabled}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleAdmin({ id: admin.id, isActive: !admin.isActive });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setError(null);
            router.refresh();
          })
        }
      >
        {admin.isActive ? "Отключить" : "Включить"}
      </Button>
    </span>
  );
}

function AdminForm({ admin, onDone }: { admin: AdminRow | null; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState(admin?.login ?? "");
  const [name, setName] = useState(admin?.name ?? "");
  const [telegramId, setTelegramId] = useState(admin?.telegramId ?? "");
  const [role, setRole] = useState(admin?.role ?? "EDITOR");
  const [password, setPassword] = useState("");
  const key = admin?.id ?? "new";

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveAdmin({
        id: admin?.id ?? null,
        fields: { login, name, telegramId, role, password },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="border-control flex flex-col gap-4 rounded-md border p-4">
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя" htmlFor={`admin-name-${key}`}>
          <TextInput
            id={`admin-name-${key}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Логин" htmlFor={`admin-login-${key}`} hint="Им входят из браузера">
          <TextInput
            id={`admin-login-${key}`}
            value={login}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setLogin(e.target.value)}
          />
        </Field>
        <Field
          label="Telegram ID"
          htmlFor={`admin-tg-${key}`}
          hint="Число. Именно на него бот пришлёт код"
        >
          <TextInput
            id={`admin-tg-${key}`}
            inputMode="numeric"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
          />
        </Field>
        <Field label="Роль" htmlFor={`admin-role-${key}`}>
          <select
            id={`admin-role-${key}`}
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRow["role"])}
            className="bg-surface text-ink border-control w-full rounded-md border px-3 py-3 text-base"
          >
            <option value="EDITOR">{ROLE_LABELS.EDITOR}</option>
            <option value="OWNER">{ROLE_LABELS.OWNER}</option>
          </select>
        </Field>
        <Field
          label={admin ? "Новый пароль" : "Пароль"}
          htmlFor={`admin-pass-${key}`}
          hint={admin ? "Пусто — оставить прежний" : "Не короче 10 символов"}
        >
          <TextInput
            id={`admin-pass-${key}`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={save} loading={pending} disabled={!name.trim() || !login.trim()}>
          Сохранить
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
