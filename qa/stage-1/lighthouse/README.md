# Lighthouse, этап 1

Мобильный профиль по умолчанию (Moto G Power, 4× CPU throttle, медленный 4G),
против **продакшен-сборки** (`pnpm build && pnpm start`), а не dev-сервера:
на dev числа не значат ничего — код не минифицирован, кэша нет, работает HMR.

Порог этапа 1: Performance ≥ 85, Accessibility ≥ 95.

JSON-отчёты рядом. Пересобрать:

```
pnpm build && pnpm start
npx lighthouse http://localhost:3100/ --quiet \
  --chrome-flags="--headless=new" \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=qa/stage-1/lighthouse/home.json
```

## Что осталось красным и почему

**`bf-cache` на категории и карточке.** Документ отдаётся с
`cache-control: no-store`, потому что маршрут динамический (PPR). Lighthouse сам
помечает это «Not actionable». Цена — переход «назад» перерисовывает страницу
вместо мгновенного восстановления; выигрыш от отказа от PPR был бы заведомо
меньше.

**`meta-description` на категории и карточке.** Описание и `<title>` в разметке
есть, но приходят **внутри `<body>`**, потоком, а не в статической `<head>`:
`generateMetadata` ждёт `params`, а под `cacheComponents` это динамика. Браузер
и React их поднимают, краулер без исполнения JS — нет. SEO вынесено в этап 3
(блок 3 брифа), там это и решается — `generateStaticParams` для категорий
(их четыре) либо метаданные на уровне прокси. Записано, не исправлено.
