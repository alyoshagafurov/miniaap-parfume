"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { confirmCode, login } from "@/app/admin/login/actions";
import { useTelegram } from "@/components/telegram/provider";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";

/**
 * Signing in to the admin panel.
 *
 * Two steps in a browser and one inside Telegram, which is less a branch in
 * this component than a consequence: the launch string is sent when there is
 * one, and the server decides what that is worth. The screen only reflects what
 * came back.
 *
 * The identifier is retyped for the code step rather than kept in a cookie
 * between them. A cookie saying "this browser is partway through signing in as
 * X" is a credential, and one worth stealing.
 *
 * Like the request form, this is react-hook-form through a transition. A
 * refused password must not clear the login field.
 */
export function LoginForm() {
  const router = useRouter();
  const { ready, isTelegram, rawInitData } = useTelegram();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<"credentials" | "code">("credentials");
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Into the panel.
   *
   * replace, not push: the login screen must not be one back press behind the
   * administrator for the rest of the session. refresh because the session
   * cookie was set on the action's response, and the router still holds the
   * payload it fetched without one.
   */
  const enter = () => {
    router.replace("/admin");
    router.refresh();
  };

  const credentials = useForm<{ login: string; password: string }>({
    defaultValues: { login: "", password: "" },
  });
  const code = useForm<{ code: string }>({ defaultValues: { code: "" } });

  const submitCredentials = credentials.handleSubmit((values) => {
    startTransition(async () => {
      try {
        const result = await login({
          ...values,
          ...(isTelegram && rawInitData ? { initDataRaw: rawInitData } : {}),
        });

        if (result.outcome === "SESSION") {
          enter();
          return;
        }
        if (result.outcome === "SEND_CODE") {
          setStage("code");
          setNotice(result.message);
          return;
        }
        setNotice(result.message);
      } catch {
        setNotice("Не удалось войти. Проверьте связь.");
      }
    });
  });

  const submitCode = code.handleSubmit((values) => {
    startTransition(async () => {
      try {
        const result = await confirmCode({
          login: credentials.getValues("login"),
          code: values.code,
        });
        if (result.outcome === "SESSION") {
          enter();
          return;
        }
        setNotice(result.message);
      } catch {
        setNotice("Не удалось войти. Проверьте связь.");
      }
    });
  });

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <p
          role="alert"
          className="border-rule bg-surface text-ink rounded-md border p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}

      {stage === "credentials" ? (
        <form
          onSubmit={(e) => void submitCredentials(e)}
          noValidate
          className="flex flex-col gap-5"
        >
          <Field
            label="Логин"
            htmlFor="login"
            error={credentials.formState.errors.login?.message}
          >
            <TextInput
              id="login"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              invalid={!!credentials.formState.errors.login}
              {...credentials.register("login", { required: "Укажите логин" })}
            />
          </Field>

          <Field
            label="Пароль"
            htmlFor="password"
            error={credentials.formState.errors.password?.message}
          >
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              invalid={!!credentials.formState.errors.password}
              {...credentials.register("password", { required: "Укажите пароль" })}
            />
          </Field>

          <Button type="submit" fullWidth loading={pending} disabled={!ready}>
            {ready && isTelegram ? "Войти" : "Получить код"}
          </Button>

          {ready && !isTelegram ? (
            <p className="text-muted text-sm">
              Код придёт в Telegram от бота. Если он ещё не писал вам — отправьте ему
              /start.
            </p>
          ) : null}
        </form>
      ) : (
        <form
          onSubmit={(e) => void submitCode(e)}
          noValidate
          className="flex flex-col gap-5"
        >
          <Field
            label="Код из Telegram"
            htmlFor="code"
            error={code.formState.errors.code?.message}
            hint="Шесть цифр, действует 5 минут"
          >
            <TextInput
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              invalid={!!code.formState.errors.code}
              {...code.register("code", {
                required: "Введите код",
                pattern: { value: /^\d{6}$/, message: "Шесть цифр" },
              })}
            />
          </Field>

          <Button type="submit" fullWidth loading={pending}>
            Войти
          </Button>

          <Button
            variant="quiet"
            type="button"
            onClick={() => {
              setStage("credentials");
              setNotice(null);
              code.reset();
              router.refresh();
            }}
          >
            Назад
          </Button>
        </form>
      )}
    </div>
  );
}
