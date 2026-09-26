import { ImportScreen } from "@/components/admin/ImportScreen";

export const metadata = { title: "Импорт и экспорт" };

export default function ImportPage() {
  return (
    <>
      <h1 className="display-caps text-ink text-h1">Импорт и экспорт</h1>
      <p className="text-muted mt-2 text-sm">
        Сначала предпросмотр, потом загрузка. Совпадение по артикулу, поэтому один и тот
        же файл можно загружать сколько угодно раз.
      </p>
      <div className="mt-6">
        <ImportScreen />
      </div>
    </>
  );
}
