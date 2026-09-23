#!/usr/bin/env bash
# Восстановление базы из дампа.
#
#   ./scripts/restore.sh                       — список доступных копий
#   ./scripts/restore.sh arumi-2026-09-24T03-10-00Z.dump.gz
#
# Бэкап, который никто ни разу не восстанавливал, — это не бэкап, а надежда.
# Проверьте этот скрипт на копии базы до того, как он понадобится всерьёз.
#
# Скрипт НИЧЕГО не удаляет молча: он требует подтверждения словом и работает
# в отдельную базу, если её указать, чтобы можно было посмотреть содержимое
# прежде, чем трогать рабочую.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.production}"
[ -f "$ENV_FILE" ] && set -a && . "./$ENV_FILE" && set +a

: "${POSTGRES_USER:?нет POSTGRES_USER}"
: "${POSTGRES_DB:?нет POSTGRES_DB}"
: "${S3_BUCKET:?нет S3_BUCKET}"
: "${S3_ENDPOINT:?нет S3_ENDPOINT}"

PREFIX="${BACKUP_PREFIX:-backups}"
TARGET_DB="${RESTORE_DB:-$POSTGRES_DB}"

aws_cli() {
  docker run --rm -i \
    -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
    -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-ru-central1}" \
    "$@"
}

if [ $# -eq 0 ]; then
  echo "Доступные копии в s3://$S3_BUCKET/$PREFIX/:"
  aws_cli amazon/aws-cli:2 s3 ls "s3://$S3_BUCKET/$PREFIX/" --endpoint-url "$S3_ENDPOINT"
  echo
  echo "Запустите: $0 <имя-файла>"
  exit 0
fi

NAME="$1"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Скачиваю $NAME…"
aws_cli -v "$TMP:/backup" amazon/aws-cli:2 \
  s3 cp "s3://$S3_BUCKET/$PREFIX/$NAME" "/backup/$NAME" --endpoint-url "$S3_ENDPOINT"
gunzip -f "$TMP/$NAME"
DUMP="$TMP/${NAME%.gz}"

cat <<WARN

  ВНИМАНИЕ
  Восстановление перезапишет базу «$TARGET_DB» целиком.
  Всё, что появилось в ней после $NAME, будет потеряно.

  Чтобы посмотреть копию, не трогая рабочую базу, прервите сейчас и
  запустите заново с RESTORE_DB=arumi_check.

WARN
read -r -p "  Наберите ВОССТАНОВИТЬ, чтобы продолжить: " CONFIRM
[ "$CONFIRM" = "ВОССТАНОВИТЬ" ] || { echo "Отменено."; exit 1; }

echo "Останавливаю приложение (база остаётся)…"
docker compose -f docker-compose.prod.yml stop web bot

# --clean --if-exists вместо пересоздания базы: локаль и расширения заданы при
# initdb, и созданная заново база получила бы локаль по умолчанию — под ней
# pg_trgm перестаёт находить кириллицу, и поиск ломается молча.
echo "Восстанавливаю в $TARGET_DB…"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$TARGET_DB" --clean --if-exists --no-owner < "$DUMP"

echo "Поднимаю приложение…"
docker compose -f docker-compose.prod.yml up -d web bot

echo
echo "Готово. Проверьте: pnpm deploy:check"
