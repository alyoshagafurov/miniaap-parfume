import { describe, expect, it } from "vitest";

import { checkSearchHealth, describeSearchHealth, orderedByName } from "./db-health";

/**
 * These run against the development database. If it is not reachable the suite
 * is skipped rather than failed — a laptop without `docker compose up` should
 * not report a red build — but in CI the database is always up, so the checks
 * do run there.
 */
const reachable = Boolean(process.env.DATABASE_URL);

describe.skipIf(!reachable)(
  "checkSearchHealth — the guard that stops a silently broken search",
  () => {
    it("passes against a correctly configured database", async () => {
      const health = await checkSearchHealth();
      expect(health.ok).toBe(true);
      expect(health.problems).toEqual([]);
    });

    it("confirms pg_trgm actually produces trigrams for Cyrillic", async () => {
      // The whole point. Under LC_CTYPE=C this returns zero trigrams, Latin search
      // keeps working, and Russian typo tolerance is silently dead.
      const health = await checkSearchHealth();
      expect(health.cyrillicTrigrams).toBeGreaterThan(0);
    });

    it("confirms the Russian ICU collation exists", async () => {
      const health = await checkSearchHealth();
      expect(health.hasRussianCollation).toBe(true);
    });

    it("reports ctype and collation so a failure message is actionable", async () => {
      const health = await checkSearchHealth();
      expect(health.ctype.toUpperCase()).toContain("UTF-8");
    });

    it("describes a failure in terms someone can act on", () => {
      const text = describeSearchHealth({
        ok: false,
        cyrillicTrigrams: 0,
        hasRussianCollation: false,
        collationSorts: false,
        ctype: "C",
        collate: "C",
        problems: ["pg_trgm не извлекает триграммы из кириллицы"],
      });
      expect(text).toContain("pg_trgm");
      expect(text).toContain("C.UTF-8");
      // Лечение зависит от площадки, и обе названы: на Railway initdb
      // недоступен, там базу с нужной локалью создают отдельно.
      expect(text).toContain("db:create-ru");
      expect(text).toContain("docker compose");
    });

    it("проверяет, что collation сортирует, а не только числится", async () => {
      // Сборка PostgreSQL без ICU показывает строку в pg_collation и падает
      // при использовании. Существование и работоспособность — разные факты,
      // и раньше проверялся только первый.
      const health = await checkSearchHealth();
      expect(health.collationSorts).toBe(true);
      expect(await orderedByName(["яблоко", "ёлка", "апельсин"])).toEqual([
        "апельсин",
        "ёлка",
        "яблоко",
      ]);
    });
  },
);

describe.skipIf(!reachable)("Cyrillic ordering", () => {
  it("sorts ё in its alphabetical place, not after я", async () => {
    const { orderedByName } = await import("./db-health");
    const words = await orderedByName(["яблоко", "ёлка", "емеля", "жасмин"]);
    // Under the database's C collation this would be: емеля, жасмин, яблоко, ёлка
    expect(words).toEqual(["ёлка", "емеля", "жасмин", "яблоко"]);
  });

  it("is case-insensitive the way a person expects", async () => {
    const { orderedByName } = await import("./db-health");
    expect(await orderedByName(["Яблоко", "абрикос", "Берёза"])).toEqual([
      "абрикос",
      "Берёза",
      "Яблоко",
    ]);
  });
});
