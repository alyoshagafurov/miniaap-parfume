# ÁRUMI Parfum & Care — рабочие правила

Оптовый каталог парфюмерии: Telegram-бот, Mini App и админка. Клиент — склад в
Хасавюрте, покупатели — оптовики по всей России, 90% с телефона внутри Telegram.

Продуктовая правда — [PRODUCT.md](PRODUCT.md). Требования этапа 1 —
[docs/prompts/stage-1.md](docs/prompts/stage-1.md). Текущее состояние —
[docs/PROGRESS.md](docs/PROGRESS.md), с него начинается каждая сессия.

---

## Стек

| | |
|---|---|
| Next.js | 16.3.6, App Router, Cache Components |
| React | 19.3.0 |
| TypeScript | 5.9.3, strict + `noUncheckedIndexedAccess` |
| Tailwind | 4.3.3, CSS-first `@theme` |
| PostgreSQL | 16, Prisma 7.10.0 + `@prisma/adapter-pg` |
| Бот | grammY 1.46.0, отдельный процесс, long polling |
| Mini App | `@tma.js/sdk-react` |
| Прочее | Redis 7, S3 (MinIO в dev), sharp, zod 4, argon2 |

**RC и новые мажоры не ставить.** `npm view prisma version` вернёт `8.0.0-rc` —
это RC, нужен 7.10.0. `npm view typescript version` вернёт 7.0.2 — нужен 5.9.3.

### Почему не то, что кажется очевидным

- **`@tma.js/*`, а не `@telegram-apps/*`.** Экосистема переименована.
  `@telegram-apps/init-data-node` помечен на npm как deprecated;
  `@telegram-apps/sdk-react` не deprecated, но последняя публикация 2025-12-05
  против 2026-07-14 у `@tma.js/sdk-react`, а документация старого пакета отдаёт 404.
  Набор хуков идентичен (`useSignal`, `useLaunchParams`, `useRawLaunchParams`,
  `useRawInitData`, `useAndroidDeviceData`, `useAndroidDeviceDataFrom`).
- **Prisma 7 не принимает `url` в `schema.prisma`** — он в `prisma.config.ts`,
  а клиент строится с драйвер-адаптером.
- **Next 16: `cacheComponents: true` на верхнем уровне**, не в `experimental`.
  `experimental.dynamicIO` и `experimental.useCache` удалены.
  `cacheTag`/`cacheLife` импортируются из `next/cache` без префикса `unstable_`.
  `revalidateTag` требует второй аргумент; из Server Action используется `updateTag`.

---

## Структура

```
src/app/(shop)/    витрина: главная, c/[slug], p/[slug], b/[slug], search, cart, orders
src/app/admin/     админка
src/app/api/       только загрузка файлов и экспорт; остальное — Server Actions
src/bot/           index.ts (точка входа `pnpm bot`), handlers/, keyboards/, texts/
src/server/        db, auth/, catalog/, orders/, import/, storage/, telegram/
src/lib/           zod-схемы, money, search, slug, env, tokens, format
src/components/    ui/, shop/, admin/
prisma/            schema, миграции, seed
```

---

## Команды

```
pnpm dev              витрина на 3100
pnpm bot              процесс бота
pnpm verify           typecheck + lint + check:tokens + test — перед каждым коммитом
pnpm test             vitest
pnpm check:tokens     страж дизайн-токенов
pnpm bench:search     замер поиска, p50/p95 по сценариям брифа
pnpm seed             68 demo-товаров
pnpm seed:bulk        1360 товаров для замеров
pnpm seed:clear       удаляет только isDemo
pnpm db:migrate       prisma migrate dev
```

Локальные сервисы: `docker compose up -d`.

**Порты — только для dev на этой машине**, потому что 3000, 5432, 6379 и 9000 здесь
заняты другими проектами. В прод-конфиги этапа 3 не переносятся.

| | dev | стандарт |
|---|---|---|
| Next | 3100 | 3000 |
| PostgreSQL | 5434 | 5432 |
| Redis | 6381 | 6379 |
| MinIO | 9100 / 9101 | 9000 / 9001 |

---

## Правила

### Деньги

Только `Int` в копейках. Никогда float, никогда рубли в хранении. Рубли существуют
на двух границах: что человек вводит в Excel и что видно на экране.
Всё через [src/lib/money.ts](src/lib/money.ts).

Потолок `Int` — 2 147 483 647 копеек = 21 474 836 ₽. Для цены позиции и суммы заявки
это с запасом; для накопительных агрегатов — нет.

Форматирование — своё, не `Intl.NumberFormat`: ICU менял разделитель разрядов между
версиями, и dev-машина с прод-сервером рендерили бы цены по-разному.

### Telegram

**Только через [src/server/telegram/client.ts](src/server/telegram/client.ts).**
Нигде больше нельзя создавать `Api` или `Bot` и нигде нельзя обращаться к
`api.telegram.org` напрямую: с российского хостинга он заблокирован, и всё идёт через
`TELEGRAM_API_ROOT`.

Webhook не используется никогда. Только long polling.

`apiRoot` покрывает только вызовы методов — скачивание файлов идёт по другому пути.
Relay этапа 3 обязан проксировать **обе** формы: `/bot<token>/<method>` и
`/file/bot<token>/<file_path>`.

### Кэш и решения

**Всё, что считает деньги, минимумы или права, читает данные без кэша.**

Витрина может показывать цену часовой давности — это нормально. Но решение
«набралась ли сумма до минимального заказа», «сколько стоит эта позиция сейчас»,
«имеет ли этот администратор такое право» обязано опираться на текущее состояние.
Если владелец поднял минимальный заказ минуту назад, следующая заявка считается
по новой цифре.

Отсюда разделение: [src/server/settings.ts](src/server/settings.ts) — чтение без
кэша и **без единого импорта из Next**, его берут бот и серверная логика;
[src/server/settings.cached.ts](src/server/settings.cached.ts) — обёртка с
`'use cache'`, её берут только React-компоненты.

Та же причина у `currentSession()`: роль перечитывается из БД на каждом вызове,
потому что cookie двенадцатичасовой давности ничего не говорит о том, не отключили
ли администратора с тех пор.

### Граница процесса бота

Бот — **отдельный процесс без контекста запроса Next**. Функция с `'use cache'`
там бросает при первом же вызове: один раз это уже случилось — `getSettings`
с директивой уронила бы `/start`, `/catalog`, `/contacts`, `/admin` и кнопку
условий.

Поэтому `src/bot/**` и всё, что он импортирует, не имеют права тянуть `next/*`.
Это проверяется правилом eslint `no-restricted-imports` и smoke-тестом, который
поднимает бота в чистом Node.

### Факты для вех D и E

Проверено по отгруженным `.d.ts` и официальной документации, затем состязательно
перепроверено вторым проходом. Поправки второго прохода учтены.

**`@tma.js/sdk-react` — это НЕ тот же API, что `@telegram-apps/sdk`.**
- Ставить только `@tma.js/sdk-react`; он тянет `@tma.js/sdk` и реэкспортирует
  его целиком. Старый `@telegram-apps/sdk-react` надо удалить — оба вешают
  глобальные слушатели на один `window.TelegramWebviewProxy`.
- `mountSync` и `restoreInitData` **не существуют**. Монтирование —
  `component.mount()`; восстановление init data — `initData.restore()`.
- **Не использовать** `useLaunchParams`, `useRawLaunchParams`, `useRawInitData`:
  все три зовут `retrieve*` внутри `useMemo`, то есть во время рендера — на
  сервере это `ReferenceError` на `window`, в обычном браузере
  `LaunchParamsRetrieveError`. Брать `retrieveRawInitData()` в эффекте в try/catch.
  `useSignal` SSR-безопасен **только для сигналов состояния** (`miniApp.isDark`,
  `backButton.isVisible`, `viewport.safeAreaInsetTop`, `themeParams.*`,
  `mainButton.state`). Сигналы-члены `.isAvailable()` и `.supports(...)` под SSR
  небезопасны.
- `isTMA()` разыменовывает `window` — только внутри `useEffect` в `'use client'`.
- `bindCssVars` бросает `CSSVarsBoundError` при втором вызове, а StrictMode React 19
  вызывает эффекты дважды. Оборачивать в `isCssVarsBound()`.
- `viewport.mount()` возвращает промис (в отличие от кнопок), и у viewport **нет**
  `unmount()`.
- `.ifAvailable()` уже включает «это Telegram + SDK поднят + isSupported + isMounted» —
  отдельные проверки не нужны. Возвращает `{ok, data}`; **несработавший вызов не
  бросает**, поэтому на него нельзя вешать обработку ошибки.
- MainButton и BackButton настраивать **только после завершения загрузки SDK**.
  Отдельные хуки, полагающиеся на порядок эффектов, гонятся с монтированием:
  держать в провайдере флаг `ready` и выходить из зависимых эффектов, пока он false.
- Весь boot-эффект, включая `isTMA()`, обернуть в try/catch.

**Next 16 + cacheComponents.**
- `searchParams` не разворачивать в теле страницы — передавать промис в дочерний
  компонент внутри `<Suspense>`, иначе ошибка сборки.
- В `'use cache'` нельзя трогать `searchParams`, `cookies()`, `headers()`.
- `useSearchParams()` без `<Suspense>` **работает в dev и падает на `next build`**.
- `router.replace(url, {scroll:false})` — полноценная навигация с перезапросом RSC;
  по-настоящему поверхностное обновление только `history.replaceState`.
- В Server Action — `updateTag(tag)`; в Route Handler он бросает, там
  `revalidateTag(tag, 'max')`. Одноаргументный `revalidateTag` не проходит typecheck.
- Ключ `'use cache'` выводится из аргументов: листинг с фильтрами кэшировать не надо,
  иначе LRU забьётся перестановками.
- Под `cacheComponents` из старых экспортов сегмента выживают только `runtime`,
  `preferredRegion`, `maxDuration`, плюс новые `instant` и `prefetch`.
  `dynamic`, `revalidate`, `fetchCache` и `dynamicParams` **ломают сборку**.
- `cookies()` внутри `'use cache'` — ошибка E831, `headers()` — E833. Не пустое
  значение, а бросок. Это и есть причина разделения settings.ts / settings.cached.ts.
- Содержимое, зависящее от `searchParams`, по умолчанию **не префетчится**. Нужен
  `partialPrefetching: true` или `export const prefetch = 'partial'` на странице
  назначения (именно на ней, не на ссылке).

**Server Actions и формы.**
- React планирует сброс формы **безусловно и до вызова** экшена — для любого
  `<form action>`, значение которого функция. Введённое пользователем **исчезнет**,
  если не вернуть его в состоянии и не положить в `defaultValue`. Это не зависит от
  того, бросил экшен или нет.
- zod 4: `z.flattenError(parsed.error).fieldErrors`, а не `.flatten()` (deprecated).
- Файл с `'use server'` может экспортировать **только** async-функции.
- `redirect()` бросает — вызывать вне try/catch.
- Лимит тела Server Action 1 МБ; импорт Excel и загрузка фото — через Route Handler.
- `x-forwarded-for` Next **не санитизирует**: relay обязан перезаписывать его
  `$remote_addr`, иначе лимит по IP обходится подделкой заголовка.

**vaul 1.1.2.**
- Всегда рендерить `Drawer.Overlay` (в нём живёт блокировка скролла) и
  `Drawer.Title` с `sr-only` — без заголовка нет `aria-labelledby` и **нет
  предупреждения в консоли**.
- Без `autoFocus` фокус не заходит в шит, а ловушка фокуса уже активна.
- Дефолт 500 мс — нарушает правило ≤ 250 мс. Переопределять `!important` вне слоёв:
  анимация докрутки после перетаскивания задана инлайновым стилем.
- Жёстко зашитое окно 500 мс после открытия, в котором перетаскивание не работает.

### Секреты и ПДн

Секреты только в env, `.env*` в `.gitignore`. Контакты, минимальный заказ и тексты —
из `Settings`, не из строковых литералов.

**ПДн не попадают в логи.** Telegram ID, имя, телефон, состав заявки не логируются.
`log: ["query"]` у Prisma включает значения параметров — вне dev запрещён.

### Поиск

Нормализация — единственный источник в [src/lib/search.ts](src/lib/search.ts),
и запрос, и хранимая колонка проходят через неё. Если они разойдутся, поиск сломается
молча.

Тонкость: NFD раскладывает `й` на `и` + combining breve, поэтому обычный
`.replace(/\p{M}/gu, '')` превращает «Майский» в «маискии». Снятие диакритики
привязано к латинской базовой букве; `ё` складывается в `е` до декомпозиции.

БД: `LC_CTYPE` обязан быть UTF-8. Под `C` pg_trgm извлекает из кириллицы **ноль**
триграмм, и опечатки по-русски не работают вообще, а латиница работает — поэтому
дефект незаметен. Порядок «А–Я» — `COLLATE "ru-RU-x-icu"` в запросе.

`similarity()` сравнивает строку целиком: короткий запрос к длинному `searchText`
никогда не проходит порог. Используется `word_similarity` / `<%`.

GIN-индексы объявлены в `schema.prisma`, не сырым SQL: невидимый для дифера Prisma
индекс будет удалён следующей же миграцией.

Артикул не входит в триграммный стог: все артикулы имеют общий префикс, и любой
запрос, похожий на артикул, совпадал бы со всем каталогом. У него точная ветка.

### Дизайн

Направление «Оливковый шёлк», токены в
[src/app/globals.css](src/app/globals.css), единственный источник значений.

`pnpm check:tokens` — 12 правил по блоку 5 брифа. Сброс пространств Tailwind
(`--color-*: initial`) убирает подмену палитры, но **ничего не запрещает**:
в v4 неизвестная утилита просто не генерирует правило, а `bg-[#ff0000]`
компилируется. Страж — это и есть запрет.

Две линии, не одна: `--color-rule` декоративная (от минимума контраста освобождена),
`--color-control` ограничивает поле ввода и обязана давать 3:1.

Золото — только линии. 2.14:1 на фоне: текстом быть не может.

Цифры не набираются дисплейным шрифтом. У Cormorant старостильные цифры, и в
сабсете нет накладного набора, поэтому «ARM-000144» уходит единицей и тройкой под
базовую линию, а `lining-nums` нечего применить. Числа — в Manrope, с
`tabular-nums`.

Движение: только шиты и модалки, только `transform`/`opacity`, ≤ 250 мс, ease-out,
уважать `prefers-reduced-motion`. Скилл `motion-ui` не используется — у правил
движения один источник, это блок 5 брифа.

### Код

TS strict. `any` запрещён правилом eslint. Каждый ввод — zod на сервере.
Права администратора проверяются в **каждом** Server Action, не только в middleware.
initData проверяется подписью для всего пользовательского.
