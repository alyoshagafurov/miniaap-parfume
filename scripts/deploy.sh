#!/usr/bin/env bash
# Развернуть или обновить ÁRUMI одной командой.
#
#   ./scripts/deploy.sh
#
# Порядок здесь не для красоты. Он вынужден одним свойством выбранной
# архитектуры, и его стоит понимать, а не просто выполнять:
#
#   Под cacheComponents `next build` ВЫПОЛНЯЕТ функции с 'use cache', чтобы
#   наполнить кэш при пререндере. То есть сборка образа витрины обращается к
#   PostgreSQL по-настоящему — за настройками, категориями, лентами. Без базы
#   она падает с «Can't reach database server», и никакие Suspense-границы это
#   не меняют: граница решает, где результат окажется, а не будет ли он
#   вычислен при сборке.
#
# Поэтому: сначала база и схема, только потом сборка витрины.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml --env-file ${ENV_FILE:-.env.production}"
ENV_FILE="${ENV_FILE:-.env.production}"
[ -f "$ENV_FILE" ] || { echo "Нет $ENV_FILE — скопируйте .env.production.example" >&2; exit 1; }
set -a && . "./$ENV_FILE" && set +a

# Адрес базы для СБОРКИ. Сборочный контейнер идёт через сеть хоста, поэтому
# 127.0.0.1 и порт, опубликованный на петле. На macOS, где --network=host
# работает иначе, переопределите BUILD_DATABASE_URL.
BUILD_DATABASE_URL="${BUILD_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT:-5432}/${POSTGRES_DB}?schema=public}"

echo "→ 1/5 База и Redis"
$COMPOSE up -d postgres redis

echo "→ 2/5 Жду, пока база ответит"
for i in $(seq 1 60); do
  if $COMPOSE exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
    echo "   готова"
    break
  fi
  [ "$i" = 60 ] && { echo "   база так и не ответила" >&2; exit 1; }
  sleep 2
done

echo "→ 3/5 Схема"
$COMPOSE run --rm migrate

echo "→ 4/5 Сборка образов"
# Витрина — обычным docker build, а не через compose: нужен --network=host,
# которого в спецификации compose нет, а без него сборка не видит базу.
docker build \
  --network=host \
  --build-arg "DATABASE_URL=$BUILD_DATABASE_URL" \
  --build-arg "NEXT_PUBLIC_S3_PUBLIC_URL=$NEXT_PUBLIC_S3_PUBLIC_URL" \
  --build-arg "NEXT_PUBLIC_YANDEX_METRICA_ID=${NEXT_PUBLIC_YANDEX_METRICA_ID:-}" \
  -f Dockerfile -t arumi-web:latest .
$COMPOSE build bot

echo "→ 5/5 Запуск"
$COMPOSE up -d

echo
echo "Готово. Проверка:"
echo "  $COMPOSE ps"
echo "  pnpm deploy:check"
