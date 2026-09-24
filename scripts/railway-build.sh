#!/usr/bin/env sh
# Сборка витрины на Railway.
#
# Один нюанс, ради которого этот файл существует.
#
# Под `cacheComponents` команда `next build` ВЫПОЛНЯЕТ функции с 'use cache',
# чтобы наполнить кэш при пререндере, — то есть по-настоящему обращается к
# PostgreSQL за настройками, категориями и лентами. Границы Suspense этого не
# меняют: граница решает, где окажется результат, а не будет ли он вычислен
# при сборке.
#
# А приватная сеть Railway при сборке недоступна: `postgres.railway.internal`
# из сборочного контейнера не резолвится. Поэтому на время сборки DATABASE_URL
# подменяется публичным адресом того же самого Postgres — Railway выдаёт его
# как DATABASE_PUBLIC_URL. В рантайме остаётся приватный: он быстрее и не
# ходит наружу.
set -eu

if [ -n "${DATABASE_PUBLIC_URL:-}" ]; then
  echo "Сборка: использую DATABASE_PUBLIC_URL (приватная сеть при сборке недоступна)"
  DATABASE_URL="$DATABASE_PUBLIC_URL"
  export DATABASE_URL
fi

pnpm prisma generate
pnpm build
