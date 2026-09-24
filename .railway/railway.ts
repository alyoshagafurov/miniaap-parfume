import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  redis,
  ref,
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
  /**
   * Регион — один на всё: EU West, Амстердам.
   *
   * Покупатели в России, и из четырёх регионов Railway Амстердам к ним ближе
   * всех. Но решает не это, а то, что все три сетевых плеча внутренние:
   * витрина ходит в Postgres на КАЖДЫЙ запрос — минимумы, права и цены читаются
   * без кэша по правилу проекта, — в Redis за лимитами, и в бакет за каждой
   * фотографией, потому что бакет закрытый и картинки идут через /api/media.
   * Сервис в одном регионе, а база в другом — это лишний океан на каждом
   * чтении, и заметно это будет не на главной, а в корзине.
   *
   * `eu-west` — псевдоним, который Railway раскрывает сам (здесь он развернулся
   * в `europe-west4-drams3a`). Рядом живут два других списка имён, и путать их
   * легко: в GraphQL-справочнике регион зовётся `europe-west4`, у бакетов
   * список из четырёх и Амстердам там `ams`, а у сервисов на Railway Metal
   * встречается `sfo`. Псевдонимы — `us-west`, `us-east`, `eu-west`,
   * `southeast-asia`.
   *
   * ВАЖНО: регион существующего сервиса этот файл НЕ меняет. `railway config
   * plan` его не сравнивает и в changeSet не кладёт — сервис `web` стоял в
   * `sfo`, план показывал desired `eu-west` и при этом не предлагал ни одного
   * изменения. Переезд сделан руками:
   *
   *   railway service scale --service web eu-west=1 sfo=0
   *
   * Для создаваемых ресурсов регион отсюда действует. Если добавится ещё один
   * сервис — проверьте его регион после apply, а не по этому файлу.
   */
  const REGION = "eu-west";

  // ── Хранилища ─────────────────────────────────────────────────────────────

  const db = postgres("postgres", { region: REGION });
  const cache = redis("redis", { region: REGION });

  /**
   * Фотографии товаров и баннер бота.
   *
   * Railway Bucket — S3-совместимый, то есть код приложения не меняется вовсе:
   * там уже @aws-sdk/client-s3.
   *
   * Регион обязателен — выбирать можно из sjc, iad, ams, sin. Здесь `ams`
   * (Амстердам): из четырёх он ближе всех к покупателям, а фотографии идут не
   * напрямую из бакета, а через /api/media/… у витрины, то есть каждый запрос
   * картинки — это ещё и путь «витрина → бакет». Его стоит держать коротким,
   * поэтому сам сервис web имеет смысл держать в европейском регионе.
   *
   * Раньше здесь стояло, что регион не задан намеренно. Это было неверно:
   * `railway config plan` отказывается строить план без него.
   *
   * Бакет закрытый: публичные бакеты Railway не поддерживает. Поэтому браузер
   * забирает фотографии не из бакета, а через /api/media/… — см. src/lib/media.ts.
   */
  const photos = bucket("photos", { region: "ams" });

  /**
   * Откуда собираются оба сервиса.
   *
   * Объявлено явно, потому что IaC описывает сервис целиком: чего в файле нет,
   * то будет снято. Первый же план, показавший `web` как существующий сервис,
   * предлагал `source.repo ("alyoshagafurov/miniaap-parfume" → null)` — то есть
   * отвязать репозиторий и выключить выкладку по push. Один репозиторий на оба
   * сервиса: они различаются не кодом, а `RAILWAY_DOCKERFILE_PATH`.
   */
  const repo = github("alyoshagafurov/miniaap-parfume", { branch: "main" });

  // ── Витрина ───────────────────────────────────────────────────────────────

  const web = service("web", {
    source: repo,
    regions: { [REGION]: 1 },

    /**
     * Публичный адрес, объявленный здесь намеренно.
     *
     * IaC описывает сервис целиком, и то, чего в файле нет, следующий `apply`
     * снимает — ровно так этот же план чуть не отвязал репозиторий. Домен
     * молча снять ещё хуже: на него ведёт кнопка каталога в боте и с него
     * Telegram забирает фотографии, так что отвалится не страница, а весь
     * каталог внутри мессенджера.
     *
     * Имя выдал Railway (`railway domain --service web`); угадать его заранее
     * нельзя, поэтому сначала домен, потом строка сюда. Он же — значение
     * MINI_APP_URL, которое задаётся руками у обоих сервисов.
     *
     * Именно `networking.serviceDomains`, а не `domains`: последнее — список
     * СВОИХ доменов, и выданный Railway адрес он отвергает словами
     * «Custom-domain registration is not supported».
     */
    networking: {
      serviceDomains: { "web-production-f03bf.up.railway.app": {} },
    },

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
      // Приватный адрес, и другого здесь нет. DATABASE_PUBLIC_URL был объявлен
      // и убран: он нужен был только сборке, а сборка в базу больше не ходит —
      // каждое чтение витрины начинается с `io()`, и пререндер выдаёт лишь
      // статическую оболочку. Публичный доступ к Postgres включать не нужно.
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,

      // `ref(photos, …)`, а не `photos.env.…`: у бакета нет `.env`.
      // Referencable-узлы в SDK — только базы (`postgres`, `redis`); `bucket()`
      // возвращает обычный узел, и обращение к `.env` роняет `railway config
      // plan` на TypeError. Это и было первым, что план поймал.
      S3_ENDPOINT: ref(photos, "ENDPOINT"),
      S3_BUCKET: ref(photos, "BUCKET"),
      S3_ACCESS_KEY: ref(photos, "ACCESS_KEY_ID"),
      S3_SECRET_KEY: ref(photos, "SECRET_ACCESS_KEY"),
      S3_REGION: ref(photos, "REGION"),
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
    source: repo,
    regions: { [REGION]: 1 },

    // Публичного домена нет и быть не должно: бот на long polling сам ходит в
    // Telegram и ничего не слушает снаружи. Webhook в этом проекте не
    // используется никогда.

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
      REDIS_URL: cache.env.REDIS_URL,

      S3_ENDPOINT: ref(photos, "ENDPOINT"),
      S3_BUCKET: ref(photos, "BUCKET"),
      S3_ACCESS_KEY: ref(photos, "ACCESS_KEY_ID"),
      S3_SECRET_KEY: ref(photos, "SECRET_ACCESS_KEY"),
      S3_REGION: ref(photos, "REGION"),
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
