# ─────────────────────────────────────────────────────────────────────────────
# Витрина и админка ÁRUMI.
#
# Debian slim, не Alpine. Prisma и sharp поставляют бинарники под конкретный
# libc, и musl-сборки у обоих — отдельная история с отдельными сюрпризами.
# Разница в размере образа здесь — десятки мегабайт, а цена ошибки — каталог,
# который не стартует на сервере в Хасавюрте в субботу.
#
# Node 22 LTS: package.json требует >=22, а LTS — то, что будет получать
# security-патчи весь срок жизни этого развёртывания.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ── Зависимости ──────────────────────────────────────────────────────────────
# Отдельным слоем: он пересобирается только когда меняется lock-файл, а не на
# каждую правку в src/.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Без --mount=type=cache. Он здесь был и убран намеренно — не возвращайте.
#
# Railway проверяет Dockerfile перед сборкой и требует, чтобы у cache-mount был
# id вида `s/<id сервиса>-<путь>`; переменных в нём он не принимает. То есть
# рабочий mount пришлось бы прибить гвоздями к идентификатору одного конкретного
# сервиса одного конкретного проекта Railway — и тот же файл перестал бы
# собираться и локально, и на запасном VPS, и в любом втором окружении.
#
# Терять почти нечего: обычный слоевой кэш Docker продолжает работать, а этот
# слой и так пересобирается только при изменении pnpm-lock.yaml. Разница
# заметна лишь при первой сборке после смены lock-файла.
RUN pnpm install --frozen-lockfile

# ── Сборка ───────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* вшиваются в бандл на этапе сборки, а не читаются в рантайме.
# Поэтому они здесь ARG, а не ENV контейнера: поменять адрес бакета или
# счётчик Метрики без пересборки нельзя, и docs/DEPLOY.md говорит об этом прямо.
ARG NEXT_PUBLIC_S3_PUBLIC_URL
ARG NEXT_PUBLIC_YANDEX_METRICA_ID
ENV NEXT_PUBLIC_S3_PUBLIC_URL=$NEXT_PUBLIC_S3_PUBLIC_URL \
    NEXT_PUBLIC_YANDEX_METRICA_ID=$NEXT_PUBLIC_YANDEX_METRICA_ID \
    NEXT_TELEMETRY_DISABLED=1

# prisma generate требует DATABASE_URL, хотя базы ему не нужно: он только
# читает схему. Причина — env("DATABASE_URL") в prisma.config.ts, который
# вычисляется при загрузке конфига и бросает, если переменной нет.
#
# Значит, при сборке образа нужен какой-то адрес — и это ARG, а не ENV,
# намеренно: ARG не попадает в окружение готового образа. Иначе забытый в
# compose DATABASE_URL молча подменился бы этой заглушкой, и приложение
# попыталось бы работать с несуществующей базой вместо того, чтобы отказаться
# стартовать и назвать переменную.
ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public

# И сверх того — база при сборке нужна по-настоящему.
#
# Под cacheComponents `next build` ВЫПОЛНЯЕТ функции с 'use cache', чтобы
# наполнить кэш при пререндере, то есть ходит в PostgreSQL за настройками,
# категориями и лентами. Границы Suspense этого не меняют.
#
# На Railway приватная сеть при сборке недоступна: `postgres.railway.internal`
# из сборочного контейнера не резолвится. Публичный TCP-прокси той же базы
# Railway отдаёт как DATABASE_PUBLIC_URL — его и берём, когда он есть.
# Объявлен через ARG, потому что переменные Railway доходят до Dockerfile
# только так, и потому что в готовый образ он попасть не должен.
#
# Локально и на VPS этой переменной нет, и всё работает по DATABASE_URL.
ARG DATABASE_PUBLIC_URL=

RUN DATABASE_URL="${DATABASE_PUBLIC_URL:-$DATABASE_URL}" pnpm prisma generate \
 && DATABASE_URL="${DATABASE_PUBLIC_URL:-$DATABASE_URL}" pnpm build

# ── Рантайм ──────────────────────────────────────────────────────────────────
# output: "standalone" уже собрал в .next/standalone только те модули, которые
# действительно импортируются. Без него сюда переехал бы весь node_modules —
# около гигабайта против примерно двухсот мегабайт.
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Образ node уже содержит непривилегированного пользователя `node`.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# Не `pnpm start`: standalone — это самостоятельный сервер, а лишний процесс
# между init и Node ломает доставку SIGTERM и превращает остановку в kill.
CMD ["node", "server.js"]
