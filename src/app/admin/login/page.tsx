import type { Metadata } from "next";

import { LoginForm } from "@/components/admin/LoginForm";
import { TelegramProvider } from "@/components/telegram/provider";
import { GoldRule } from "@/components/ui/GoldRule";

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
        <h1 className="font-wordmark text-wordmark text-h1 text-center leading-tight font-semibold">
          ÁRUMI
        </h1>
        <p className="caps text-muted mt-2 text-center">Админ-панель</p>
        <GoldRule className="mx-auto mt-4 mb-8 w-24" />
        {/*
          Whether a code follows the password is a deployment's setting, and the
          form has no way to know it — so the screen promised one regardless.
          With ADMIN_LOGIN_REQUIRE_CODE=0 the button still read «Получить код»
          and the line under it still said the bot would write, while the
          password alone signed you straight in. Read here and passed down.
        */}
        <LoginForm
          requireCode={(process.env.ADMIN_LOGIN_REQUIRE_CODE ?? "1").trim() !== "0"}
        />
      </main>
    </TelegramProvider>
  );
}
