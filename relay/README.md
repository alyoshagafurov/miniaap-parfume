# Релей Bot API

Отдельная машина **за пределами России**. Нужна потому, что `api.telegram.org`
с российских хостингов не отвечает, а бот и приложение обязаны ходить в Telegram
через `TELEGRAM_API_ROOT`.

Подойдёт самый маленький VPS: релей не хранит состояние и не считает ничего —
он пересылает запросы. Трафик — это текст заявок и изредка фотографии.

## Что нужно

- VPS вне РФ с белым IP;
- домен или поддомен, указывающий на него (`relay.example.com`);
- IP основного сервера — только он будет допущен.

## Установка

```bash
mkdir -p /opt/arumi-relay && cd /opt/arumi-relay
# скопируйте сюда relay/Caddyfile из репозитория

docker run -d --name arumi-relay --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -e DOMAIN=relay.example.com \
  -e ACME_EMAIL=you@example.com \
  -e ALLOWED_IP=203.0.113.10 \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v arumi-relay-data:/data \
  caddy:2-alpine
```

`ALLOWED_IP` принимает несколько адресов через пробел, если основной сервер
переезжает или их два.

Затем на основном сервере в `.env.production`:

```
TELEGRAM_API_ROOT=https://relay.example.com
```

## Проверка

С основного сервера:

```bash
curl -s "https://relay.example.com/bot$BOT_TOKEN/getMe" | head -c 200
```

Ожидается `{"ok":true,...}` с именем бота. Та же команда с любой другой машины
обязана вернуть `403` — если она возвращает что-то другое, `ALLOWED_IP` задан
неверно и релей открыт всему интернету.

`pnpm deploy:check` на основном сервере проверяет ровно это и обе формы пути.

## Чего здесь нет

Вебхуков. Бот работает только long polling: вебхук требует, чтобы Telegram
достучался внутрь, а он не может. Релей — это исходящее направление и только.
