"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { removeImage, reorderImages } from "@/app/admin/(panel)/products/actions";
import { Button } from "@/components/ui/Button";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_MB } from "@/lib/images";
import { objectUrl } from "@/lib/media";

export interface ManagedImage {
  id: string;
  key: string;
  width: number;
  height: number;
}

interface Upload {
  /** Stable within this session; the file name is not unique. */
  token: number;
  name: string;
  state: "uploading" | "done" | "failed";
  error?: string;
}

/**
 * The photographs of one product.
 *
 * Files go up one at a time, each as its own request, and each gets its own
 * line. That is the whole design: the owner selects five pictures off a phone,
 * one of them is the HEIC the camera saved by default, and the other four must
 * still arrive — with the failure naming itself rather than taking the batch
 * down with it.
 *
 * Order is changed with buttons, not by dragging. Dragging a thumbnail on a
 * phone competes with scrolling, and this interface's motion budget is spent on
 * sheets; two arrows work with a thumb, with a keyboard and with a screen
 * reader, and say which position each picture is in.
 *
 * The first photograph is the cover. Stated on the card rather than set by a
 * separate control, because "first" and "cover" being two different things is
 * how a product ends up with a cover nobody chose.
 */
export function ImageManager({
  productId,
  images,
}: {
  productId: string;
  images: readonly ManagedImage[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const nextToken = useRef(0);

  const upload = async (files: FileList) => {
    // Sequential on purpose: five parallel uploads of a phone photograph
    // saturate an uplink and all five get slower, while the owner watches a row
    // of bars that do not move.
    for (const file of Array.from(files)) {
      const token = ++nextToken.current;
      setUploads((current) => [...current, { token, name: file.name, state: "uploading" }]);

      const body = new FormData();
      body.set("productId", productId);
      body.set("file", file);

      try {
        const response = await fetch("/api/admin/images", { method: "POST", body });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setUploads((current) =>
            current.map((u) =>
              u.token === token
                ? { ...u, state: "failed", error: payload.error ?? "Не удалось загрузить" }
                : u,
            ),
          );
          continue;
        }
        setUploads((current) =>
          current.map((u) => (u.token === token ? { ...u, state: "done" } : u)),
        );
      } catch {
        setUploads((current) =>
          current.map((u) =>
            u.token === token ? { ...u, state: "failed", error: "Нет связи" } : u,
          ),
        );
      }
    }
    router.refresh();
  };

  const move = (index: number, delta: number) => {
    const next = [...images];
    const target = index + delta;
    const moved = next[index];
    const displaced = next[target];
    if (!moved || !displaced) return;
    next[index] = displaced;
    next[target] = moved;

    startTransition(async () => {
      const result = await reorderImages({ productId, imageIds: next.map((i) => i.id) });
      setNotice(result.ok ? null : result.message);
      router.refresh();
    });
  };

  const remove = (imageId: string) => {
    startTransition(async () => {
      const result = await removeImage({ imageId });
      setNotice(result.ok ? null : result.message);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="caps text-muted mb-2 block">Фотографии</span>
        <p className="text-muted text-xs">
          JPEG, PNG или WebP, до {MAX_UPLOAD_MB} МБ. Первая — обложка. Снимки с айфона в
          формате HEIC не подойдут: сохраните их как JPEG.
        </p>
      </div>

      {notice ? (
        <p role="alert" className="border-danger bg-danger-wash text-ink rounded-md border p-3 text-sm">
          {notice}
        </p>
      ) : null}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.id} className="border-rule rounded-md border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objectUrl(image.key)}
                alt=""
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
                className="bg-surface aspect-[4/5] w-full rounded-md object-cover"
              />
              <p className="text-muted mt-2 text-xs">
                {index === 0 ? "Обложка" : `Фото ${index + 1}`}
              </p>
              <div className="mt-2 flex items-center gap-1">
                <IconButton
                  label={`Переместить фото ${index + 1} назад`}
                  disabled={index === 0 || pending}
                  onClick={() => move(index, -1)}
                >
                  ←
                </IconButton>
                <IconButton
                  label={`Переместить фото ${index + 1} вперёд`}
                  disabled={index === images.length - 1 || pending}
                  onClick={() => move(index, 1)}
                >
                  →
                </IconButton>
                <Button variant="quiet" type="button" disabled={pending} onClick={() => remove(image.id)}>
                  Удалить
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm">Фотографий пока нет.</p>
      )}

      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {uploads.map((u) => (
            <li key={u.token} className="text-sm">
              <span className="text-muted">{u.name}</span>{" "}
              {u.state === "uploading" ? (
                <span className="text-muted">— загружается…</span>
              ) : u.state === "done" ? (
                <span className="text-olive">— готово</span>
              ) : (
                <span className="text-danger" role="alert">
                  — {u.error}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            // Cleared, so selecting the same file twice in a row still fires.
            e.target.value = "";
          }}
        />
        <Button variant="secondary" type="button" onClick={() => input.current?.click()}>
          Добавить фото
        </Button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="border-control text-ink hover:bg-olive-wash disabled:text-muted h-11 w-11 rounded-md border transition-colors disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
