"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn, formatDate, formatPhone } from "@/lib/format";
import type { Client } from "@/lib/types";
import { Input } from "./ui";

/** Recherche d'un client existant (nom, prénom, téléphone) avec liste déroulante. */
export function ClientSearch({
  value,
  onSelect,
  excludeId,
  placeholder = "Rechercher un client : nom, prénom, téléphone…",
}: {
  value: Client | null;
  onSelect: (c: Client | null) => void;
  excludeId?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Client[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<Client[]>(`/api/clients?q=${encodeURIComponent(q)}&limit=15`)
        .then((r) => {
          setResults(r.filter((c) => c.id !== excludeId));
          setActive(0);
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, excludeId]);

  function pick(c: Client) {
    onSelect(c);
    setQ("");
    setOpen(false);
  }

  if (value) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-md border border-paulie-green-bright/60 bg-paulie-green/15 px-3 text-sm">
        <span className="font-medium">{value.name}</span>
        {typeof value.data.telephone === "string" && <span className="text-xs text-cream-muted">{formatPhone(value.data.telephone)}</span>}
        <button type="button" onClick={() => onSelect(null)} className="ml-auto rounded p-1 text-cream-muted hover:bg-night-700 hover:text-cream" title="Retirer">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!results?.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(results[active]);
          }
        }}
        placeholder={placeholder}
        className="pl-9"
      />
      {open && results && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-night-500 bg-night-900 py-1 shadow-2xl">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-cream-dim">Aucun client trouvé.</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm", i === active && "bg-paulie-red/80 text-cream")}
              >
                <span className="truncate">{c.name}</span>
                <span className={cn("ml-auto shrink-0 text-xs", i === active ? "text-cream" : "text-cream-dim")}>
                  {typeof c.data.date_naissance === "string" ? formatDate(c.data.date_naissance) : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
