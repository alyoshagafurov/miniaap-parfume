"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_MB, parsePhotoFilename } from "@/lib/images";

interface Row {
  token: number;
  name: string;
  /** What the filename claims the article is, before the server confirms it. */
  guess: string;
  order: number;
  state: "queued" | "uploading" | "done" | "failed";
  sku?: string;
  error?: string;
}

/**
 * Photographs, matched to products by their filename.
 *
 * The workflow the brief calls «массовые фото»: the owner photographs the whole
 * range in one sitting, names the files after the articles already printed on
 * the shelf labels, and drops the lot in. Three hundred products is three
 * hundred trips through the product form otherwise.
 *
 * Every file is listed before anything is sent, with the article read out of
 * its name. That list is the point: it is where a typo in a filename is caught,
 * while it is still cheap to rename the file, rather than after two hundred
 * uploads have gone to the wrong places or nowhere.
 *
 * One request per file, in sequence, each with its own outcome — the same shape
 * as the product form's uploader, for the same reason. One HEIC among fifty
 * must not take the other forty-nine down with it.
 */
export function BulkPhotos() {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const nextToken = useRef(0);

  const queue = (files: FileList) => {
    const added: Row[] = Array.from(files).map((file) => {
      const parsed = parsePhotoFilename(file.name);
      return {
        token: ++nextToken.current,
        name: file.name,
        guess: parsed.candidates[parsed.candidates.length - 1] ?? file.name,
        order: parsed.order,
        state: "queued" as const,
      };
    });
    setRows((current) => [...current, ...added]);
    return added;
  };

  const send = async (files: File[], queued: Row[]) => {
    setRunning(true);
    for (const [index, file] of files.entries()) {
      const row = queued[index];
      if (!row) continue;
      setRows((current) =>
        current.map((r) => (r.token === row.token ? { ...r, state: "uploading" } : r)),
      );

      const parsed = parsePhotoFilename(file.name);
      const body = new FormData();
      // Every candidate, in order. The server tries them so that `ARM-1005.jpg`
      // resolves to ARM-1005 and not to ARM.
      for (const candidate of parsed.candidates) body.append("sku", candidate);
      body.set("file", file);

      try {
        const response = await fetch("/api/admin/images", { method: "POST", body });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          sku?: string;
        };
        setRows((current) =>
          current.map((r) =>
            r.token === row.token
              ? response.ok
                ? { ...r, state: "done", sku: payload.sku }
                : { ...r, state: "failed", error: payload.error ?? "Не удалось загрузить" }
              : r,
          ),
        );
      } catch {
        setRows((current) =>
          current.map((r) =>
            r.token === row.token ? { ...r, state: "failed", error: "Нет связи" } : r,
          ),
        );
      }
    }
    setRunning(false);
  };

  const done = rows.filter((r) => r.state === "done").length;
  const failed = rows.filter((r) => r.state === "failed").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              const queued = queue(files);
              void send(Array.from(files), queued);
            }
            e.target.value = "";
          }}
        />
        <Button onClick={() => input.current?.click()} loading={running}>
          Выбрать фотографии
        </Button>
      </div>

      {rows.length > 0 ? (
        <>
          <p className="text-muted text-sm tabular-nums" aria-live="polite">
            Загружено: {done} · не удалось: {failed} · всего: {rows.length}
          </p>

          <ul className="flex flex-col">
            {rows.map((row) => (
              <li
                key={row.token}
                className="border-rule flex flex-wrap items-baseline justify-between gap-3 border-b py-2"
              >
                <span className="text-ink font-mono text-xs">{row.name}</span>
                <span className="text-sm">
                  {row.state === "queued" ? (
                    <span className="text-muted">
                      → {row.guess}, фото {row.order}
                    </span>
                  ) : row.state === "uploading" ? (
                    <span className="text-muted">загружается…</span>
                  ) : row.state === "done" ? (
                    <span className="text-olive">→ {row.sku}</span>
                  ) : (
                    <span className="text-danger" role="alert">
                      {row.error}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {failed > 0 && !running ? (
            <p className="text-muted text-sm">
              Переименуйте файлы, которые не нашли товар, и выберите их снова — уже
              загруженные не пострадают.
            </p>
          ) : null}
        </>
      ) : null}

      <div className="border-rule rounded-md border p-4">
        <h2 className="caps text-muted">Как называть файлы</h2>
        <ul className="text-muted mt-3 flex flex-col gap-1 text-sm">
          <li>
            <span className="text-ink font-mono">ARM-1005.jpg</span> — обложка товара ARM-1005
          </li>
          <li>
            <span className="text-ink font-mono">ARM-1005-2.jpg</span> — второе фото того же
            товара
          </li>
          <li>Регистр не важен, фотографии добавляются после уже загруженных.</li>
          <li>JPEG, PNG или WebP, до {MAX_UPLOAD_MB} МБ. HEIC с айфона сначала сохраните как JPEG.</li>
        </ul>
      </div>
    </div>
  );
}
