import { autoRetry } from "@grammyjs/auto-retry";
import { Api } from "grammy";

/**
 * The only place in this codebase that talks to the Telegram Bot API.
 *
 * Nothing else may construct an Api or a Bot, and nothing else may fetch
 * api.telegram.org, because of where this runs: from a Russian VPS that host is
 * blocked, so every call has to go through a relay outside the country. One
 * client means one place where that root is configured and one place to look
 * when it is wrong.
 *
 * The web process uses this Api directly to notify the manager and to send
 * login codes; it never polls. The bot process (src/bot) builds a Bot with the
 * same client options and owns long polling. Webhooks are not used at all.
 */

/**
 * grammY throws at construction if apiRoot ends in a slash, which is an easy
 * thing to leave in an environment variable and a confusing crash to debug.
 */
function normaliseApiRoot(value: string | undefined): string {
  const root = (value ?? "https://api.telegram.org").trim().replace(/\/+$/, "");
  if (root === "") return "https://api.telegram.org";
  return root;
}

export function apiRoot(): string {
  return normaliseApiRoot(process.env.TELEGRAM_API_ROOT);
}

/**
 * Client options shared by the web process and the bot process, so the two can
 * never drift into talking to different hosts.
 *
 * Note for the relay (stage 3): apiRoot covers method calls only. File
 * downloads are a separate path shape, so the relay must proxy BOTH
 * /bot<token>/<method> and /file/bot<token>/<file_path> — a relay that forwards
 * only the first works in testing and breaks the moment a photo is fetched.
 */
export function clientOptions() {
  return {
    apiRoot: apiRoot(),
    // Default is 500s. A request that cannot be answered should fail while
    // someone is still watching, not half an hour later.
    timeoutSeconds: 30,
  };
}

/**
 * Applies retry behaviour. Both limits are set explicitly because auto-retry
 * defaults them to Infinity: a `retry_after: 3600` would otherwise put the
 * process to sleep for an hour inside a single call.
 */
export function installAutoRetry(api: Api): void {
  api.config.use(
    autoRetry({
      maxRetryAttempts: 3,
      maxDelaySeconds: 30,
      // Network failures are retried by grammY's own loop, which
      // maxRetryAttempts does NOT bound. Rethrowing hands control back here so
      // a relay outage surfaces instead of retrying silently forever.
      rethrowHttpErrors: true,
    }),
  );
}

let cached: Api | undefined;

/**
 * The shared Api instance, built on first use.
 *
 * Lazy for the same reason the Prisma client is: importing this module must not
 * read the environment, or any script that loads .env in its own body breaks,
 * since ES imports are evaluated before the first statement runs.
 */
export function telegramApi(): Api {
  if (cached) return cached;

  const token = process.env.BOT_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error("BOT_TOKEN не задан — Telegram API недоступен. Проверьте .env");
  }

  const api = new Api(token, clientOptions());
  installAutoRetry(api);
  cached = api;
  return api;
}

/** Tests replace the client; nothing in production calls this. */
export function __setTelegramApiForTests(api: Api | undefined): void {
  cached = api;
}
