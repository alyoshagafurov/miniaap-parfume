/**
 * Search benchmark.
 *
 * Runs the scenarios named in the brief against whatever is currently seeded
 * and reports p50/p95 latency. Used to produce the numbers in the stage report;
 * `pnpm seed:bulk` first for the 1 200+ row figure.
 *
 *   pnpm bench:search
 */

import { loadDotEnv } from "../src/lib/env";
import { searchProducts } from "../src/server/catalog/search";
import { prisma } from "../src/server/db";

loadDotEnv();

const SCENARIOS: Array<{ label: string; query: string; expect: string }> = [
  { label: "бренд кириллицей", query: "шанель", expect: "Chanel" },
  { label: "опечатка (нет ь)", query: "шанел", expect: "Chanel" },
  { label: "бренд латиницей", query: "chanel", expect: "Chanel" },
  { label: "опечатка латиницей", query: "chanl", expect: "Chanel" },
  { label: "аромат кириллицей", query: "саваж", expect: "Sauvage" },
  { label: "аромат латиницей", query: "sauvage", expect: "Sauvage" },
  { label: "артикул", query: "ARM-1005", expect: "ARM-1005" },
  { label: "артикул без дефиса", query: "arm 1005", expect: "ARM-1005" },
  { label: "ё → е", query: "ёлка", expect: "(ничего)" },
  { label: "нота из описания", query: "кофе", expect: "Black Opium" },
  { label: "двойняшка", query: "мадемуазель", expect: "Coco Mademoiselle" },
  { label: "пусто", query: "щщщщщ", expect: "(ничего)" },
];

const RUNS = 12;

function pct(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}

async function main() {
  const total = await prisma.product.count();
  console.log(`\nТоваров в базе: ${total}\n`);
  console.log(
    "сценарий".padEnd(22) +
      "запрос".padEnd(14) +
      "нашлось".padStart(8) +
      "p50".padStart(9) +
      "p95".padStart(8) +
      "  первый результат",
  );
  console.log("─".repeat(104));

  let worst = 0;
  for (const s of SCENARIOS) {
    const times: number[] = [];
    let found = 0;
    let first = "";
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const res = await searchProducts({ query: s.query, limit: 24 });
      times.push(performance.now() - t0);
      found = res.total;
      first = res.rows[0]?.title ?? "—";
    }
    const p50 = pct(times, 50);
    const p95 = pct(times, 95);
    worst = Math.max(worst, p95);
    console.log(
      s.label.padEnd(22) +
        s.query.padEnd(14) +
        String(found).padStart(8) +
        `${p50.toFixed(1)}ms`.padStart(9) +
        `${p95.toFixed(1)}ms`.padStart(8) +
        "  " +
        first.slice(0, 34),
    );
  }

  console.log("─".repeat(104));
  console.log(
    `\nХудший p95: ${worst.toFixed(1)} ms  (бюджет 150 ms) — ${worst <= 150 ? "OK" : "ПРЕВЫШЕН"}\n`,
  );
  await prisma.$disconnect();
  if (worst > 150) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
