import { z } from "zod";

/**
 * Loads .env into process.env.
 *
 * Prisma 7 stopped loading .env, and tsx never did, so standalone scripts and
 * the bot process must ask for it explicitly. Node has had this built in since
 * 20.12, so it costs no dependency. In production the variables come from the
 * container environment and there is no file — hence the tolerated failure.
 */
export function loadDotEnv(file = ".env"): void {
  try {
    process.loadEnvFile(file);
  } catch {
    // No .env: expected wherever real environment variables are set.
  }
}

/**
 * Environment.
 *
 * Validated once, at the edge, so a missing variable is a startup error with a
 * useful message rather than `undefined` surfacing three layers deep at
 * request time. Secrets are never re-exported anywhere else.
 */

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL обязателен"),
  REDIS_URL: z.string().min(1, "REDIS_URL обязателен"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET должен быть не короче 32 символов"),

  BOT_TOKEN: z.string().min(1).optional(),
  BOT_USERNAME: z.string().min(1).optional(),
  // api.telegram.org is unreachable from Russian hosting, so this points at the
  // relay in production. Defaulted rather than required so local work and tests
  // need no extra setup.
  TELEGRAM_API_ROOT: z.string().url().default("https://api.telegram.org"),
  ADMIN_CHAT_ID: z.string().optional(),
  MINI_APP_URL: z.string().url().optional(),

  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  /**
   * Публичный адрес бакета — если он публичный.
   *
   * Необязателен, и пустое значение здесь не «забыли заполнить», а вторая
   * рабочая конфигурация: Railway Bucket закрытый, публичных бакетов Railway
   * не поддерживает, и тогда браузер забирает фотографии через /api/media/…
   * Требовать адрес значило бы требовать того, чего у площадки нет.
   *
   * Заполнен — браузер ходит в бакет напрямую и байты не идут через
   * приложение. Это путь Yandex Object Storage и MinIO в разработке.
   */
  NEXT_PUBLIC_S3_PUBLIC_URL: z.string().url().or(z.literal("")).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * A variable written as empty is a variable that is not set.
 *
 * `.env.example` lists every key with nothing after the `=`, which is the
 * normal way to document one — and copying it produces `BOT_USERNAME=""`, not
 * an absent key. Zod's `.optional()` admits `undefined` and refuses `""`, so
 * without this the whole environment fails to parse over a variable nobody
 * needed, and every caller of env() throws: the S3 client, the bot's startup,
 * the share link.
 *
 * It cost an afternoon once. An upload returned "хранилище недоступно" while
 * the bucket was fine, because the real error was `BOT_USERNAME: Too small`.
 */
function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = value?.trim() === "" ? undefined : value;
  }
  return out;
}

/**
 * A misconfigured environment, distinguishable from anything else that failed.
 *
 * It has its own class because of a real afternoon: `env()` is called lazily
 * from the S3 client, so an empty BOT_USERNAME made an image upload answer
 * «хранилище недоступно» while the bucket was in perfect health. A caller that
 * cannot tell a configuration fault from an outage will report the outage,
 * every time.
 */
export class EnvError extends Error {
  constructor(
    /** The variables at fault, by name, for an operator to act on. */
    readonly variables: string[],
    message: string,
  ) {
    super(message);
    this.name = "EnvError";
  }
}

/** Throws on first call if the environment is incomplete. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(withoutBlanks(process.env));
  if (!parsed.success) {
    const variables = [
      ...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "?"))),
    ];
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new EnvError(variables, `Некорректное окружение:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Checks the environment without throwing.
 *
 * For the two startup paths, which want to print every fault at once rather
 * than the first one and then exit.
 */
export function checkEnv():
  { ok: true } | { ok: false; variables: string[]; message: string } {
  try {
    env();
    return { ok: true };
  } catch (error) {
    if (error instanceof EnvError) {
      return { ok: false, variables: error.variables, message: error.message };
    }
    throw error;
  }
}

/**
 * The bot process needs credentials the web process does not; it calls this
 * instead of reaching for process.env directly.
 */
export function botEnv(): ServerEnv & { BOT_TOKEN: string; BOT_USERNAME: string } {
  const e = env();
  if (!e.BOT_TOKEN || !e.BOT_USERNAME) {
    throw new Error("BOT_TOKEN и BOT_USERNAME обязательны для процесса бота");
  }
  return e as ServerEnv & { BOT_TOKEN: string; BOT_USERNAME: string };
}
