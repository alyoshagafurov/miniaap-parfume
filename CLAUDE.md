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

Движение: только шиты и модалки, только `transform`/`opacity`, ≤ 250 мс, ease-out,
уважать `prefers-reduced-motion`. Скилл `motion-ui` не используется — у правил
движения один источник, это блок 5 брифа.

### Код

TS strict. `any` запрещён правилом eslint. Каждый ввод — zod на сервере.
Права администратора проверяются в **каждом** Server Action, не только в middleware.
initData проверяется подписью для всего пользовательского.
