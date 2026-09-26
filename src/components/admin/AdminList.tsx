"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveAdmin, toggleAdmin } from "@/app/admin/(panel)/admins/actions";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { formatDateRu } from "@/lib/format";
import type { AdminField, AdminFieldErrors, AdminRow } from "@/server/admin/admins";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Владелец — всё",
  EDITOR: "Редактор — каталог и заявки",
};

/**
 * Who can get in.
 *
 * Two or three people, so they are listed and edited in place. Every row shows
 * its Telegram id, because that id is the allow-list: the Mini App login checks
 * the launch string against it, and the bot shows the «Админ-панель» button
 * only to it. A row with somebody else's number looks fine here and leaves its
 * owner without the button, which is why the field says where the number
 * comes from.
 *
 * Nobody is deleted, only switched off. The question "who changed this" only
 * has an answer while the row exists, and `isActive` is re-read from the
 * database on every request — so switching somebody off takes effect on their
 * next click, not when their cookie expires twelve hours later.
 */
export function AdminList({
  admins,
  currentId,
}: {
  admins: readonly AdminRow[];
  currentId: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <div className="stage p-5">
          <AdminForm admin={null} onDone={() => setCreating(false)} />
        </div>
      ) : (
        <div>
          <Button onClick={() => setCreating(true)}>Добавить администратора</Button>
        </div>
      )}

      <ul className="stage divide-rule flex flex-col divide-y overflow-hidden">
        {admins.map((admin) =>
          editing === admin.id ? (
            <li key={admin.id} className="p-5">
              <AdminForm admin={admin} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={admin.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-ink text-base font-bold">
                  {admin.name}
                  <span className="text-muted ml-2 text-sm font-normal">
                    {admin.login}
                  </span>
                  {admin.id === currentId ? (
                    <span className="text-muted ml-2 text-xs">это вы</span>
                  ) : null}
                  {admin.isActive ? null : (
                    <span className="text-danger ml-2 text-xs">отключён</span>
                  )}
                </p>
                <p className="text-muted mt-0.5 text-xs tabular-nums">
                  Telegram ID {admin.telegramId} ·{" "}
                  {ROLE_LABELS[admin.role] ?? admin.role} · с{" "}
                  {formatDateRu(admin.createdAt)}
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
            const result = await toggleAdmin({
              id: admin.id,
              isActive: !admin.isActive,
            });
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
  const [fieldErrors, setFieldErrors] = useState<AdminFieldErrors>({});
  const [login, setLogin] = useState(admin?.login ?? "");
  const [name, setName] = useState(admin?.name ?? "");
  const [telegramId, setTelegramId] = useState(admin?.telegramId ?? "");
  const [role, setRole] = useState(admin?.role ?? "EDITOR");
  const [password, setPassword] = useState("");
  const key = admin?.id ?? "new";

  // A reason stays under its field until that field is edited: the rest are
  // still true, and clearing them all on one keystroke would hide what is left
  // to fix.
  const edited = (field: AdminField) =>
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const save = () => {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveAdmin({
        id: admin?.id ?? null,
        fields: { login, name, telegramId, role, password },
      });
      if (!result.ok) {
        const fields = result.fields ?? {};
        setFieldErrors(fields);
        // Above the form only what belongs to no field — «не удалось
        // сохранить». Saying a field's reason twice reads as two problems.
        setError(Object.values(fields).some(Boolean) ? null : result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя" htmlFor={`admin-name-${key}`} error={fieldErrors.name}>
          <TextInput
            id={`admin-name-${key}`}
            value={name}
            invalid={!!fieldErrors.name}
            aria-describedby={describedBy(`admin-name-${key}`, fieldErrors.name, false)}
            onChange={(e) => {
              setName(e.target.value);
              edited("name");
            }}
          />
        </Field>
        <Field
          label="Логин"
          htmlFor={`admin-login-${key}`}
          hint="Им входят из браузера"
          error={fieldErrors.login}
        >
          <TextInput
            id={`admin-login-${key}`}
            value={login}
            autoCapitalize="off"
            autoCorrect="off"
            invalid={!!fieldErrors.login}
            aria-describedby={describedBy(
              `admin-login-${key}`,
              fieldErrors.login,
              true,
            )}
            onChange={(e) => {
              setLogin(e.target.value);
              edited("login");
            }}
          />
        </Field>
        <Field
          label="Telegram ID"
          htmlFor={`admin-tg-${key}`}
          hint="Человек узнает его, отправив нашему боту /id. По этому числу бот покажет ему кнопку «Админ-панель»"
          error={fieldErrors.telegramId}
        >
          <TextInput
            id={`admin-tg-${key}`}
            inputMode="numeric"
            value={telegramId}
            invalid={!!fieldErrors.telegramId}
            aria-describedby={describedBy(
              `admin-tg-${key}`,
              fieldErrors.telegramId,
              true,
            )}
            onChange={(e) => {
              setTelegramId(e.target.value);
              edited("telegramId");
            }}
          />
        </Field>
        <Field label="Роль" htmlFor={`admin-role-${key}`} error={fieldErrors.role}>
          <select
            id={`admin-role-${key}`}
            value={role}
            aria-invalid={!!fieldErrors.role || undefined}
            aria-describedby={describedBy(`admin-role-${key}`, fieldErrors.role, false)}
            onChange={(e) => {
              setRole(e.target.value as AdminRow["role"]);
              edited("role");
            }}
            className={`bg-surface text-ink w-full rounded-md border px-3 py-3 text-base ${
              fieldErrors.role ? "border-danger" : "border-control"
            }`}
          >
            <option value="EDITOR">{ROLE_LABELS.EDITOR}</option>
            <option value="OWNER">{ROLE_LABELS.OWNER}</option>
          </select>
        </Field>
        <Field
          label={admin ? "Новый пароль" : "Пароль"}
          htmlFor={`admin-pass-${key}`}
          hint={admin ? "Пусто — оставить прежний" : "Не короче 10 символов"}
          error={fieldErrors.password}
        >
          <TextInput
            id={`admin-pass-${key}`}
            type="password"
            autoComplete="new-password"
            value={password}
            invalid={!!fieldErrors.password}
            aria-describedby={describedBy(
              `admin-pass-${key}`,
              fieldErrors.password,
              true,
            )}
            onChange={(e) => {
              setPassword(e.target.value);
              edited("password");
            }}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={save}
          loading={pending}
          disabled={!name.trim() || !login.trim()}
        >
          Сохранить
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

/**
 * Ties a control to the line under it.
 *
 * Field renders the hint or the error, never both, under ids made from the
 * control's; this points at whichever is showing, so a screen reader reads the
 * reason when it lands on the field rather than only the moment it appeared.
 */
function describedBy(
  id: string,
  error: string | undefined,
  hasHint: boolean,
): string | undefined {
  if (error) return `${id}-error`;
  return hasHint ? `${id}-hint` : undefined;
}
