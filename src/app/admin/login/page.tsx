import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LoginForm } from "@/components/admin/LoginForm";
import { TelegramProvider } from "@/components/telegram/provider";

export const metadata: Metadata = {
  title: "Вход",
  // Nothing about the back office belongs in an index.
  robots: { index: false, follow: false },
};

/**
 * The way in.
 *
 * Outside the guarded layout on purpose: a login screen behind a login guard
 * redirects to itself.
 *
 * TelegramProvider is here and not only on the storefront, because the
 * administrator arrives through the bot's «Админ-панель» button and the launch
 * string is what makes that one-step sign-in possible.
 */
export default function AdminLoginPage() {
  return (
    <TelegramProvider>
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-12">
        <p
          aria-hidden
          className="font-wordmark text-wordmark text-3xl leading-none font-semibold"
        >
          ÁRUMI
        </p>
        <h1 className="display-caps text-ink mt-8 text-2xl">Вход в админку</h1>
        <div className="stage mt-5 p-5">
          <Suspense fallback={<FormSkeleton />}>
            <Form />
          </Suspense>
        </div>
        <Link
          href="/"
          prefetch={false}
          className="text-ink mt-6 inline-flex min-h-11 items-center self-center text-sm font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
        >
          На витрину
        </Link>
      </main>
    </TelegramProvider>
  );
}

/**
 * The form, told whether a code follows the password.
 *
 * Whether it does is a deployment's setting, and the form has no way to know
 * it — so the screen once promised a code regardless. Reading the variable in
 * the page fixed that locally and not in production, and the reason is the
 * build: this page has nothing dynamic in it, so `next build` prerendered it
 * and froze whatever the variable was at that moment. Railway hands service
 * variables to the running container, not to the build, so production was
 * built with the switch unset — the default, «code required» — and showed
 * «Получить код» while the server signed people in on the password alone.
 *
 * `connection()` waits for a real request, so the switch is read where it is
 * actually set.
 */
async function Form() {
  await connection();
  const requireCode = (process.env.ADMIN_LOGIN_REQUIRE_CODE ?? "1").trim() !== "0";
  return <LoginForm requireCode={requireCode} />;
}

function FormSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className="bg-primary-wash h-3 w-16 rounded-md" />
      <div className="bg-primary-wash h-12 rounded-md" />
      <div className="bg-primary-wash h-3 w-16 rounded-md" />
      <div className="bg-primary-wash h-12 rounded-md" />
      <div className="bg-primary-wash h-12 rounded-full" />
    </div>
  );
}
