import type { Metadata } from "next";
import Link from "next/link";

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
        {/*
          Whether a code follows the password is a deployment's setting, and the
          form has no way to know it — so the screen promised one regardless.
          With ADMIN_LOGIN_REQUIRE_CODE=0 the button still read «Получить код»
          and the line under it still said the bot would write, while the
          password alone signed you straight in. Read here and passed down.
        */}
        <div className="stage mt-5 p-5">
          <LoginForm
            requireCode={(process.env.ADMIN_LOGIN_REQUIRE_CODE ?? "1").trim() !== "0"}
          />
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
