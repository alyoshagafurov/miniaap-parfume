"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { formatRub } from "@/lib/money";

interface RowError {
  row: number;
  field: string;
  message: string;
  value?: string;
}

interface Preview {
  mode: "preview";
  ok: boolean;
  fatal?: string;
  unknownColumns: string[];
  duplicateColumns: string[];
  total: number;
  errors: RowError[];
  truncatedErrors: boolean;
  sample: Array<{
    row: number;
    sku: string;
    brand: string;
    fragrance: string;
    priceKop: number;
    volumeMl: number;
  }>;
}

interface Outcome {
  mode: "commit";
  created: number;
  updated: number;
  skipped: Array<{ row: number; sku: string; reason: string }>;
  createdBrands: string[];
  createdFragrances: string[];
  createdCategories: string[];
  parseErrors: number;
}

/**
 * Importing a price list.
 *
 * Preview, then commit, and the preview is the whole point: three hundred rows
 * of somebody else's spreadsheet always contain a surprise, and the useful
 * moment to find it is before anything is written. The file is sent twice
 * rather than parked on the server between the two steps — a parked upload is
 * state with a lifetime and an owner, and re-sending it costs less than either.
 *
 * Errors are addressed by the row number printed down the side of the
 * administrator's own spreadsheet, so «строка 47» means what it says in Excel.
 */
export function ImportScreen() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (chosen: File, mode: "preview" | "commit") => {
    setBusy(mode);
    setError(null);
    const body = new FormData();
    body.set("file", chosen);
    body.set("mode", mode);

    try {
      const response = await fetch("/api/admin/import", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as
        | Preview
        | Outcome
        | { error?: string };

      if (!response.ok) {
        setError("error" in payload ? (payload.error ?? "Не удалось") : "Не удалось");
        return;
      }
      if ("mode" in payload && payload.mode === "preview") {
        setPreview(payload);
        setOutcome(null);
      } else if ("mode" in payload && payload.mode === "commit") {
        setOutcome(payload);
        setPreview(null);
        router.refresh();
      }
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    } finally {
      setBusy(null);
    }
  };

  const importable = preview ? preview.total : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/admin/import/template"
          className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
        >
          Скачать шаблон .xlsx
        </a>
        <a
          href="/api/admin/export"
          className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
        >
          Выгрузить каталог .xlsx
        </a>
      </div>

      <div className="border-rule rounded-md border p-4">
        <p className="text-muted text-sm">
          Выгрузка и шаблон — одни и те же колонки, поэтому выгруженный файл можно
          править в Excel и загружать обратно. Совпадение идёт по артикулу: повторная
          загрузка того же файла обновит товары, а не создаст их заново.
        </p>
      </div>

      <div>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = "";
            if (!chosen) return;
            setFile(chosen);
            setOutcome(null);
            void send(chosen, "preview");
          }}
        />
        <Button onClick={() => input.current?.click()} loading={busy === "preview"}>
          Выбрать файл
        </Button>
        {file ? <span className="text-muted ml-3 text-sm">{file.name}</span> : null}
      </div>

      {error ? (
        <p role="alert" className="border-danger bg-danger-wash text-ink rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="flex flex-col gap-4">
          {preview.fatal ? (
            <p role="alert" className="border-danger bg-danger-wash text-ink rounded-md border p-3 text-sm">
              {preview.fatal}
            </p>
          ) : (
            <>
              <p className="text-ink text-base tabular-nums">
                Готово к загрузке: {preview.total} строк
                {preview.errors.length > 0 ? `, с ошибками: ${preview.errors.length}` : ""}
              </p>

              {preview.unknownColumns.length > 0 ? (
                <p className="text-muted text-sm">
                  Колонки, которые мы не знаем и пропустим:{" "}
                  {preview.unknownColumns.join(", ")}. Это нормально — в прайсе бывают
                  служебные столбцы.
                </p>
              ) : null}

              {preview.duplicateColumns.length > 0 ? (
                <p className="text-muted text-sm">
                  Повторяющиеся колонки — возьмём левую: {preview.duplicateColumns.join(", ")}
                </p>
              ) : null}

              {preview.sample.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <caption className="caps text-muted mb-2 text-left">
                      Первые строки — проверьте, что колонки встали на места
                    </caption>
                    <thead>
                      <tr className="border-rule border-b text-left">
                        <th scope="col" className="caps text-muted py-2">Строка</th>
                        <th scope="col" className="caps text-muted py-2">Артикул</th>
                        <th scope="col" className="caps text-muted py-2">Бренд</th>
                        <th scope="col" className="caps text-muted py-2">Аромат</th>
                        <th scope="col" className="caps text-muted py-2">Объём</th>
                        <th scope="col" className="caps text-muted py-2">Цена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((row) => (
                        <tr key={row.row} className="border-rule border-b">
                          <td className="text-muted py-2 tabular-nums">{row.row}</td>
                          <td className="text-ink py-2 font-mono text-xs">{row.sku}</td>
                          <td className="text-ink py-2">{row.brand}</td>
                          <td className="text-ink py-2">{row.fragrance}</td>
                          <td className="text-muted py-2 tabular-nums">{row.volumeMl} мл</td>
                          <td className="text-ink py-2 tabular-nums">{formatRub(row.priceKop)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {preview.errors.length > 0 ? (
                <div>
                  <h2 className="caps text-muted">Строки с ошибками — их пропустим</h2>
                  <ul className="mt-2 flex flex-col gap-1">
                    {preview.errors.map((rowError, i) => (
                      <li key={`${rowError.row}-${rowError.field}-${i}`} className="text-sm">
                        <span className="text-ink tabular-nums">Строка {rowError.row}</span>
                        <span className="text-muted"> · {rowError.message}</span>
                        {rowError.value ? (
                          <span className="text-muted"> — «{rowError.value}»</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {preview.truncatedErrors ? (
                    <p className="text-muted mt-2 text-sm">
                      Ошибок слишком много, показаны первые. Похоже, файл не тот.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {importable > 0 ? (
                <div>
                  <Button
                    onClick={() => file && void send(file, "commit")}
                    loading={busy === "commit"}
                  >
                    Загрузить {importable} строк
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {outcome ? (
        <div className="border-olive bg-olive-wash flex flex-col gap-3 rounded-md border p-4">
          <h2 className="text-ink text-base font-semibold">Импорт завершён</h2>
          <p className="text-ink text-sm tabular-nums">
            Создано: {outcome.created} · обновлено: {outcome.updated} · пропущено:{" "}
            {outcome.skipped.length + outcome.parseErrors}
          </p>

          {outcome.createdBrands.length > 0 ? (
            <p className="text-muted text-sm">
              Новые бренды: {outcome.createdBrands.join(", ")}. Добавьте им алиасы —
              без них по-русски не найдут.
            </p>
          ) : null}
          {outcome.createdCategories.length > 0 ? (
            <p className="text-muted text-sm">
              Новые категории: {outcome.createdCategories.join(", ")}
            </p>
          ) : null}
          {outcome.createdFragrances.length > 0 ? (
            <p className="text-muted text-sm">
              Новых ароматов: {outcome.createdFragrances.length}. У них пока нет нот и
              описания.
            </p>
          ) : null}

          {outcome.skipped.length > 0 ? (
            <div>
              <h3 className="caps text-muted">Не записаны</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {outcome.skipped.map((s, i) => (
                  <li key={`${s.row}-${i}`} className="text-sm">
                    <span className="text-ink tabular-nums">Строка {s.row}</span>
                    <span className="text-muted"> · {s.sku} · {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-muted text-sm">
            Новые товары созданы черновиками, если в файле не указан статус. Опубликовать
            их можно массовым действием в таблице товаров.
          </p>
        </div>
      ) : null}
    </div>
  );
}
