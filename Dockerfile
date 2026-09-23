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
# ─────────────────────────────────────────────────────────────────────────────
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
