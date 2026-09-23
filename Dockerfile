# ─────────────────────────────────────────────────────────────────────────────
# Витрина и админка ÁRUMI.
#
# Alpine, и это выбор, а не умолчание.
#
# Оба тяжёлых нативных модуля проекта поставляют сборки под musl: sharp —
# @img/sharp-linuxmusl-*, Prisma 7 работает через драйвер-адаптер @prisma/adapter-pg,
# то есть говорит с Postgres обычной библиотекой pg, а не нативным движком.
# Единственное, чего musl-сборке Prisma не хватает из коробки, — openssl, он
# ставится ниже явно.
#
# Проверено, а не предположено: образ собран, поднят и прогнан через
# `pnpm deploy:check` (Prisma, Redis, S3, релей) и `pnpm brand:banner` (sharp)
# внутри контейнера. Ровно эти две библиотеки и ломаются на musl, и обе здесь
# выполняются по-настоящему.
#
# Node 22 LTS: package.json требует >=22, а LTS — то, что будет получать
# security-патчи весь срок жизни этого развёртывания.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# openssl — для Prisma; libc6-compat — для пакетов, собранных под glibc-ABI.
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /app

# ── Зависимости ──────────────────────────────────────────────────────────────
# Отдельным слоем: он пересобирается только когда меняется lock-файл, а не на
# каждую правку в src/.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

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

RUN pnpm prisma generate && pnpm build

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
