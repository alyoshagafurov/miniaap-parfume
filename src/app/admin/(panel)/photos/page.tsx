import { BulkPhotos } from "@/components/admin/BulkPhotos";

export const metadata = { title: "Массовые фото" };

/**
 * Photographs in bulk.
 *
 * No server data: the whole screen is the file picker and what the server says
 * about each file, so there is nothing to load and nothing to suspend on.
 */
export default function PhotosPage() {
  return (
    <>
      <h1 className="display-caps text-ink text-h1">Массовые фото</h1>
      <p className="text-muted mt-2 text-sm">
        Назовите файлы артикулами — они сами привяжутся к товарам. Каждый файл идёт
        отдельно: один неудачный не отменяет остальные.
      </p>
      <div className="mt-6">
        <BulkPhotos />
      </div>
    </>
  );
}
