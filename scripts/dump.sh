#!/usr/bin/env bash
# Ручная выгрузка базы в файл.
#
#   railway run ./scripts/dump.sh          # с Railway
#   ./scripts/dump.sh                      # где угодно, если задан DATABASE_URL
#   DUMP_DIR=/mnt/backups ./scripts/dump.sh
#
# Это НЕ замена регулярным копиям. На Railway их делает сама платформа —
# включите бэкапы у сервиса Postgres, они снимаются по расписанию и хранятся
# без вашего участия. Этот скрипт для другого: забрать копию себе перед
# рискованной правкой, перед обновлением схемы, или чтобы увезти данные с
# площадки.
#
# На своём сервере регулярные копии делает scripts/backup.sh — он умеет
# расписание, выгрузку в S3 и удаление старых.
set -euo pipefail

cd "$(dirname "$0")/.."

# Railway отдаёт приватный адрес рабочим сервисам и публичный — всему
# остальному. `railway run` подставляет оба; снаружи кластера работает второй.
: "${DATABASE_URL:=${DATABASE_PUBLIC_URL:-}}"
if [ -z "${DATABASE_URL}" ]; then
  echo "Не задан DATABASE_URL (или DATABASE_PUBLIC_URL)." >&2
  echo "С Railway:  railway run ./scripts/dump.sh" >&2
  exit 1
fi

# Prisma кладёт в строку подключения свои параметры, которых libpq не знает:
# `?schema=public` — обязательный для Prisma и незнакомый pg_dump, который
# отвечает «неверный параметр в URI». Тот же набор приезжает и из переменных
# Railway, если их составляли под Prisma.
strip_prisma_params() {
  printf '%s' "$1" | sed -E \
    -e 's/([?&])(schema|pgbouncer|connection_limit|pool_timeout|socket_timeout)=[^&]*//g' \
    -e 's/\?&/?/' -e 's/[?&]$//'
}
DATABASE_URL="$(strip_prisma_params "$DATABASE_URL")"

DUMP_DIR="${DUMP_DIR:-./backups}"
mkdir -p "$DUMP_DIR"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT="$DUMP_DIR/arumi-${STAMP}.dump"

echo "Снимаю дамп…"

# Формат custom (-Fc): сжат, восстанавливается параллельно и позволяет достать
# одну таблицу, не разбирая текстовый файл на сотни мегабайт.
#
# --no-owner: на новой площадке роли называются иначе, и дамп, требующий
# конкретного владельца, не восстановится туда, куда его везут.
pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "$OUT"

SIZE_BYTES=$(wc -c < "$OUT" | tr -d ' ')
MIN_BYTES="${DUMP_MIN_BYTES:-10240}"
if [ "$SIZE_BYTES" -lt "$MIN_BYTES" ]; then
  echo "ОШИБКА: дамп весит ${SIZE_BYTES} байт — это не похоже на базу каталога." >&2
  echo "Файл оставлен для разбора: $OUT" >&2
  exit 1
fi

echo
echo "  $OUT  ($(du -h "$OUT" | cut -f1))"
echo
echo "  Восстановить в другую базу:"
echo "    pg_restore -d \"\$DATABASE_URL\" --clean --if-exists --no-owner \"$OUT\""
echo
