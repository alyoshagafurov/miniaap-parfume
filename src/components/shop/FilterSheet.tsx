"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TextInput } from "@/components/ui/Field";
import {
  buildListHref,
  FAMILY_LABELS,
  filterCount,
  GENDER_LABELS,
  NO_FILTERS,
  type ActiveFilters,
  type Family,
  type Gender,
  type SortKey,
} from "@/lib/list-url";
import type { Facets } from "@/server/catalog/list";

/**
 * The filter panel.
 *
 * Selections are held locally while the sheet is open and written to the URL
 * only on "Показать". Writing per tap would issue a server request per tap —
 * router.replace performs a real navigation, however shallow it looks — and
 * would fill the history with states the buyer passed through rather than chose.
 */
export function FilterSheet({
  open,
  onOpenChange,
  facets,
  filters,
  basePath,
  sort,
  resultCount,
  extra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facets: Facets;
  filters: ActiveFilters;
  basePath: string;
  sort: SortKey;
  resultCount: number;
  /** Anything the listing owns beyond the shared filters — `q` on search. */
  extra?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState<ActiveFilters>(filters);
  const [brandQuery, setBrandQuery] = useState("");

  // Re-seed the draft each time the sheet opens, so cancelling really cancels.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(filters);
      setBrandQuery("");
    }
  }

  const brands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    if (!q) return facets.brands;
    return facets.brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [facets.brands, brandQuery]);

  const apply = (next: ActiveFilters) => {
    startTransition(() => {
      router.replace(buildListHref(basePath, next, sort, extra), { scroll: false });
    });
    onOpenChange(false);
  };

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const selected = filterCount(draft);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Фильтры"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => apply(NO_FILTERS)} disabled={selected === 0}>
            Сбросить
          </Button>
          <Button fullWidth onClick={() => apply(draft)}>
            Показать
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        <p className="text-muted text-sm" aria-live="polite">
          Сейчас показано: {resultCount}
        </p>

        <section>
          <h3 className="caps text-muted mb-3">Бренд</h3>
          {facets.brands.length > 8 ? (
            <div className="mb-3">
              <label htmlFor="brand-filter-search" className="sr-only">
                Поиск по брендам
              </label>
              <TextInput
                id="brand-filter-search"
                type="search"
                value={brandQuery}
                onChange={(e) => setBrandQuery(e.target.value)}
                placeholder="Найти бренд"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {brands.map((b) => (
              <Chip
                key={b.slug}
                selected={draft.brands.includes(b.slug)}
                onClick={() => setDraft({ ...draft, brands: toggle(draft.brands, b.slug) })}
              >
                {b.name}
                <span className="text-xs tabular-nums opacity-70">{b.count}</span>
              </Chip>
            ))}
            {brands.length === 0 ? <p className="text-muted text-sm">Ничего не нашлось</p> : null}
          </div>
        </section>

        {facets.genders.length > 1 ? (
          <section>
            <h3 className="caps text-muted mb-3">Пол</h3>
            <div className="flex flex-wrap gap-2">
              {facets.genders.map((g) => (
                <Chip
                  key={g.value}
                  selected={draft.gender === g.value}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      gender: draft.gender === g.value ? null : (g.value as Gender),
                    })
                  }
                >
                  {GENDER_LABELS[g.value] ?? g.value}
                  <span className="text-xs tabular-nums opacity-70">{g.count}</span>
                </Chip>
              ))}
            </div>
          </section>
        ) : null}

        {facets.families.length > 0 ? (
          <section>
            <h3 className="caps text-muted mb-3">Семейство</h3>
            <div className="flex flex-wrap gap-2">
              {facets.families.map((f) => (
                <Chip
                  key={f.value}
                  selected={draft.families.includes(f.value as Family)}
                  onClick={() =>
                    setDraft({ ...draft, families: toggle(draft.families, f.value as Family) })
                  }
                >
                  {FAMILY_LABELS[f.value] ?? f.value}
                  <span className="text-xs tabular-nums opacity-70">{f.count}</span>
                </Chip>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h3 className="caps text-muted mb-3">Наличие</h3>
          <Chip
            selected={draft.inStockOnly}
            onClick={() => setDraft({ ...draft, inStockOnly: !draft.inStockOnly })}
          >
            Только в наличии
          </Chip>
        </section>
      </div>
    </Sheet>
  );
}
