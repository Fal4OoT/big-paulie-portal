"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import type { CatalogVehicle } from "@/lib/types";
import { Input } from "./ui";

// Catalogue mis en cache pour la session (il ne change qu'à l'import).
let cache: Promise<CatalogVehicle[]> | null = null;
export function loadCatalog(force = false): Promise<CatalogVehicle[]> {
  if (!cache || force) cache = api.get<CatalogVehicle[]>("/api/catalog").catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}

/** Minuscules sans accents ni ponctuation : « Brioso R/A » ≈ « brioso ra ». */
export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MAX_RESULTS = 60;

export function VehicleSearch({
  catalog,
  value,
  onSelect,
  autoFocus,
}: {
  catalog: CatalogVehicle[];
  value: CatalogVehicle | null;
  onSelect: (v: CatalogVehicle | null) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const indexed = useMemo(() => catalog.map((v) => ({ v, key: normalize(v.name), compact: normalize(v.name).replace(/ /g, "") })), [catalog]);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return indexed.slice(0, MAX_RESULTS).map((x) => x.v);
    const terms = q.split(" ");
    const qCompact = q.replace(/ /g, "");
    return indexed
      .filter((x) => terms.every((t) => x.key.includes(t)) || x.compact.includes(qCompact))
      .sort((a, b) => Number(!a.key.startsWith(q)) - Number(!b.key.startsWith(q)) || a.key.localeCompare(b.key))
      .slice(0, MAX_RESULTS)
      .map((x) => x.v);
  }, [query, indexed]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(v: CatalogVehicle) {
    onSelect(v);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (value) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-md border border-paulie-green-bright/60 bg-paulie-green/15 px-3 text-sm">
        <span className="font-medium">{value.name}</span>
        {value.segmentLabel && (
          <span className="text-xs text-cream-muted">
            {value.segmentEmoji} {value.segmentLabel}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="ml-auto rounded p-1 text-cream-muted hover:bg-night-700 hover:text-cream"
          title="Changer de véhicule"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={`Rechercher parmi ${catalog.length} véhicules…`}
        className="pl-9"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-night-500 bg-night-900 py-1 shadow-2xl"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-cream-dim">Aucun véhicule ne correspond.</li>
          ) : (
            results.map((v, i) => (
              <li
                key={v.id}
                data-index={i}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(v);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm", i === active && "bg-paulie-red/80 text-cream")}
              >
                <span className="truncate">{v.name}</span>
                {v.segmentLabel && (
                  <span className={cn("ml-auto shrink-0 text-xs", i === active ? "text-cream" : "text-cream-dim")}>
                    {v.segmentEmoji} {v.segmentLabel}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
