/**
 * A stand-in for the Telegram relay.
 *
 * Everything this project sends to Telegram goes through TELEGRAM_API_ROOT,
 * because api.telegram.org is unreachable from Russian hosting. That makes the
 * relay a load-bearing piece of stage 3 — and an untestable one, because you
 * cannot see what the application sends without either a real bot or something
 * standing where the relay will stand.
 *
 * This is that something. It answers every Bot API call with a plausible `ok`
 * and writes the request to a log, so the browser login code, an order
 * notification or a greeting can be read locally and checked. It is a test
 * fixture: it verifies nothing about Telegram, only about what we send.
 *
 *   node scripts/relay-stub.mjs [логфайл]
 *
 * Then, in .env:
 *   BOT_TOKEN=111111:LOCAL-STUB
 *   TELEGRAM_API_ROOT=http://localhost:3199
 *
 * It answers both shapes the real relay must proxy — `/bot<token>/<method>` and
 * `/file/bot<token>/<path>` — so a relay that only forwards the first is
 * visibly different from this one.
 */

import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 3199;
const LOG = process.argv[2] ?? "relay-stub.log";

writeFileSync(LOG, "");

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const line = `${new Date().toISOString()} ${req.method} ${req.url} ${body}`;
    appendFileSync(LOG, `${line}\n`);
    console.log(line);

    // File downloads take the other path and are not a JSON API call.
    if (req.url?.startsWith("/file/")) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end("stub-file");
      return;
    }

    // getMe отвечает как getMe. Заглушка, отдающая на любой метод форму
    // ответа sendMessage, выглядит рабочей ровно до того момента, когда
    // кто-нибудь спросит у неё, кто этот бот, — а спрашивают двое: проверка
    // развёртывания и пульс самого бота, то есть ровно те, кто должен ловить
    // сломанный релей. Заглушка обязана быть отличима от неработающего релея
    // тем же способом, каким от него отличим настоящий.
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url?.includes("/getMe")) {
      res.end(
        JSON.stringify({
          ok: true,
          result: {
            id: 111111,
            is_bot: true,
            first_name: "ÁRUMI (заглушка)",
            username: "arumi_local_stub",
            can_join_groups: true,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
          },
        }),
      );
      return;
    }

    res.end(
      JSON.stringify({
        ok: true,
        result: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
      }),
    );
  });
}).listen(PORT, () => {
  console.log(`Заглушка релея на http://localhost:${PORT}, лог: ${LOG}`);
});
