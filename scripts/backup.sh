#!/usr/bin/env bash
# Ежедневный дамп базы в объектное хранилище.
#
#   ./scripts/backup.sh
#
# В cron на основном сервере:
#   10 3 * * * cd /opt/arumi && ./scripts/backup.sh >> /var/log/arumi-backup.log 2>&1
#
# Что именно бэкапится и почему только это: вся правда проекта живёт в
# PostgreSQL. Фотографии лежат в объектном хранилище, у которого своя
# избыточность и своё версионирование; дублировать их сюда — платить за
# гигабайты второй раз ради данных, которые и так не теряются. Redis не
# бэкапится вовсе: там счётчики лимитов и коды входа со сроком жизни в пять
# минут.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.production}"
[ -f "$ENV_FILE" ] && set -a && . "./$ENV_FILE" && set +a

: "${POSTGRES_USER:?нет POSTGRES_USER}"
: "${POSTGRES_DB:?нет POSTGRES_DB}"
: "${S3_BUCKET:?нет S3_BUCKET}"
: "${S3_ENDPOINT:?нет S3_ENDPOINT}"
: "${S3_ACCESS_KEY:?нет S3_ACCESS_KEY}"
: "${S3_SECRET_KEY:?нет S3_SECRET_KEY}"

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
PREFIX="${BACKUP_PREFIX:-backups}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
NAME="arumi-${STAMP}.dump.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[$(date -u +%FT%TZ)] дамп ${POSTGRES_DB}…"

# Формат custom (-Fc), а не plain SQL: он сжимается, восстанавливается
# параллельно и позволяет достать одну таблицу, не разбирая текстовый файл на
# сотни мегабайт. Гонится через docker exec, чтобы версия pg_dump совпадала с
# версией сервера — несовпадение мажоров отказывается работать, и узнать об
# этом в момент восстановления хуже некуда.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  | gzip -9 > "$TMP/$NAME"

SIZE=$(du -h "$TMP/$NAME" | cut -f1)

# Пустой или подозрительно маленький дамп — это не бэкап. Лучше громко упасть
# сейчас, чем обнаружить это при восстановлении.
MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"
ACTUAL=$(wc -c < "$TMP/$NAME")
if [ "$ACTUAL" -lt "$MIN_BYTES" ]; then
  echo "ОШИБКА: дамп весит ${ACTUAL} байт — это не похоже на базу каталога." >&2
  exit 1
fi

echo "[$(date -u +%FT%TZ)] выгружаю ${NAME} (${SIZE})…"

docker run --rm \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  -e AWS_DEFAULT_REGION="${S3_REGION:-ru-central1}" \
  -v "$TMP:/backup:ro" \
  amazon/aws-cli:2 \
  s3 cp "/backup/$NAME" "s3://$S3_BUCKET/$PREFIX/$NAME" \
  --endpoint-url "$S3_ENDPOINT"

# Чистка старых. Считается по дате в имени файла, а не по LastModified: имя
# задаётся здесь и не меняется, а LastModified переписывается при любом
# копировании объекта и однажды сохранит то, что должно было удалиться.
CUTOFF=$(date -u -d "${KEEP_DAYS} days ago" +%Y-%m-%d 2>/dev/null \
      || date -u -v-"${KEEP_DAYS}"d +%Y-%m-%d)

docker run --rm \
  -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  -e AWS_DEFAULT_REGION="${S3_REGION:-ru-central1}" \
  amazon/aws-cli:2 \
  s3 ls "s3://$S3_BUCKET/$PREFIX/" --endpoint-url "$S3_ENDPOINT" \
  | awk '{print $4}' | grep -E '^arumi-[0-9]{4}-[0-9]{2}-[0-9]{2}T' \
  | while read -r old; do
      day="${old#arumi-}"; day="${day%%T*}"
      if [[ "$day" < "$CUTOFF" ]]; then
        echo "  удаляю $old"
        docker run --rm \
          -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
          -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
          -e AWS_DEFAULT_REGION="${S3_REGION:-ru-central1}" \
          amazon/aws-cli:2 \
          s3 rm "s3://$S3_BUCKET/$PREFIX/$old" --endpoint-url "$S3_ENDPOINT"
      fi
    done

echo "[$(date -u +%FT%TZ)] готово: $PREFIX/$NAME, храним ${KEEP_DAYS} дней"
