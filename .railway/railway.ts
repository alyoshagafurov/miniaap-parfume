import {
  bucket,
  defineRailway,
  postgres,
  preserve,
  project,
  redis,
  service,
} from "railway/iac";

/**
 * ÁRUMI на Railway.
 *
 *   railway config plan     показать, что изменится
 *   railway config apply    применить
 *
 * Плана достаточно, чтобы увидеть расхождение до того, как оно случится:
 * Railway всегда строит план перед применением и ждёт подтверждения.
 *
 * ── Почему это .railway/railway.ts, а не railway.toml ──
 *
 * Config as Code (railway.json / railway.toml) объявлен устаревшим: файлы
 * перестают читаться 2026-12-01, а новые сервисы в него уже не пускают. Замена —
 * Infrastructure as Code, один файл на проект, который применяет CLI.
 *
 * ── Секреты ──
 *
 * `preserve()` означает: значение задаётся в интерфейсе Railway и этим файлом
 * не трогается. Токен бота, секрет сессий и id чата менеджера объявлены так
 * намеренно — они не в коде, не в коммитах и не в отчётах. IaC знает, что такие
 * переменные есть, и не знает, чему они равны.
 */
export default defineRailway(() => {
  // ── Хранилища ─────────────────────────────────────────────────────────────

  const db = postgres("postgres");
  const cache = redis("redis");

  /**
   * Фотографии товаров и баннер бота.
   *
   * Railway Bucket — S3-совместимый, то есть код приложения не меняется вовсе:
   * там уже @aws-sdk/client-s3. Регион не задан здесь намеренно — он выбирается
   * при создании бакета и после не меняется, так что зашивать его в файл
   * значило бы однажды получить план, который ничего не может сделать.
   *
   * Бакет закрытый: публичные бакеты Railway не поддерживает. Поэтому браузер
   * забирает фотографии не из бакета, а через /api/media/… — см. src/lib/media.ts.
   */
  const photos = bucket("photos");

  // ── Витрина ───────────────────────────────────────────────────────────────

  const web = service("web", {
    // Ни build, ни start здесь нет намеренно.
    //
    // В репозитории лежит Dockerfile, и Railway собирает им, а не Railpack.
    // Значит сборку описывает Dockerfile, а запуск — его CMD (`node server.js`).
    // Указывать здесь `start: "pnpm start"` было ошибкой: образ собран с
    // output: "standalone", в нём нет ни next, ни полного node_modules, и
    // `pnpm start` внутри него падает — проверено запуском образа.
    //
    // preDeploy с миграциями по той же причине переехал к боту: в standalone
    // нет ни prisma CLI, ни каталога миграций.

    // Трогает PostgreSQL. «/» отдаётся из кэша и отвечает 200 при мёртвой базе
    // — то есть ровно в том случае, ради которого проверка и существует.
    healthcheck: "/api/health",
    healthcheckTimeout: 120,

    env: {
      // Какой Dockerfile собирать. Без этого оба сервиса берут корневой, и бот
      // получил бы образ витрины — со стартовой командой, которой в нём нет.
      RAILWAY_DOCKERFILE_PATH: "Dockerfile",

      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      // Только для сборки: приватная сеть при сборке недоступна, а `next build`
      // под cacheComponents в базу ходит. Dockerfile объявляет её через ARG и
      // предпочитает, когда она есть. В рантайме работает приватный адрес выше.
      DATABASE_PUBLIC_URL: db.env.DATABASE_PUBLIC_URL,
      REDIS_URL: cache.env.REDIS_URL,

      S3_ENDPOINT: photos.env.ENDPOINT,
      S3_BUCKET: photos.env.BUCKET,
      S3_ACCESS_KEY: photos.env.ACCESS_KEY_ID,
      S3_SECRET_KEY: photos.env.SECRET_ACCESS_KEY,
      S3_REGION: photos.env.REGION,
      // Пусто намеренно: бакет закрытый, публичного адреса у него нет, и
      // фотографии идут через /api/media/…. Значение появляется здесь только
      // если каталог переедет на публичный бакет.
      NEXT_PUBLIC_S3_PUBLIC_URL: "",

      // Адрес, который Railway выдал этому сервису. Задаётся руками один раз:
      // на него ведёт кнопка каталога в боте, и он же — основа абсолютных
      // ссылок на фотографии для Telegram.
      MINI_APP_URL: preserve(),

      // Пусто — значит напрямую в api.telegram.org, что с Railway работает.
      // Переменная остаётся на случай переезда в РФ, где понадобится релей.
      TELEGRAM_API_ROOT: preserve(),

      // Задаются в интерфейсе Railway и этим файлом не трогаются.
      BOT_TOKEN: preserve(),
      BOT_USERNAME: preserve(),
      ADMIN_CHAT_ID: preserve(),
      AUTH_SECRET: preserve(),
      NEXT_PUBLIC_YANDEX_METRICA_ID: preserve(),

      // Перед приложением стоит один прокси — прокси самого Railway. Число
      // важно: лимиты заявок и входа считают по адресу из x-forwarded-for,
      // который Next не санитизирует.
      TRUSTED_PROXY_HOPS: "1",

      // HTTPS на Railway есть с первой минуты и сертификатом занимается
      // платформа, поэтому HSTS можно включать сразу — в отличие от своего
      // сервера, где он до проверенного сертификата опасен.
      ENABLE_HSTS: "1",

      DEPLOY_TARGET: "railway",
    },
  });

  // ── Бот ───────────────────────────────────────────────────────────────────

  const bot = service("bot", {
    // Порта нет и healthcheck не объявлен: это воркер на long polling. Живость
    // он подтверждает сам — раз в минуту спрашивает у Telegram, кто он, и пишет
    // время в BOT_HEARTBEAT_FILE.
    //
    // build и start задаёт Dockerfile.bot; его CMD — `pnpm bot`.

    // Миграции здесь, а не у витрины, по одной практической причине: этот образ
    // собран с полными зависимостями и исходниками, в нём есть prisma CLI и
    // каталог миграций, а standalone-образ витрины не содержит ни того, ни
    // другого. preDeploy выполняется один раз между сборкой и запуском, когда
    // приватная сеть уже доступна, и неудачная миграция останавливает выкладку.
    preDeploy: "pnpm prisma migrate deploy",

    env: {
      RAILWAY_DOCKERFILE_PATH: "Dockerfile.bot",

      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      // Не для рантайма — чтобы `railway run --service bot` с машины
      // разработчика мог достучаться до базы: приватный адрес снаружи кластера
      // не резолвится.
      DATABASE_PUBLIC_URL: db.env.DATABASE_PUBLIC_URL,
      REDIS_URL: cache.env.REDIS_URL,

      S3_ENDPOINT: photos.env.ENDPOINT,
      S3_BUCKET: photos.env.BUCKET,
      S3_ACCESS_KEY: photos.env.ACCESS_KEY_ID,
      S3_SECRET_KEY: photos.env.SECRET_ACCESS_KEY,
      S3_REGION: photos.env.REGION,
      NEXT_PUBLIC_S3_PUBLIC_URL: "",

      MINI_APP_URL: preserve(),
      TELEGRAM_API_ROOT: preserve(),
      BOT_TOKEN: preserve(),
      BOT_USERNAME: preserve(),
      ADMIN_CHAT_ID: preserve(),
      AUTH_SECRET: preserve(),

      BOT_HEARTBEAT_FILE: "/tmp/arumi-bot-alive",
      DEPLOY_TARGET: "railway",
    },
  });

  return project("arumi", { resources: [db, cache, photos, web, bot] });
});
