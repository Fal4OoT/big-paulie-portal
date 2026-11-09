"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ageFrom, cn, formatDate, formatDateTime, formatPhone, formatRelative } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { Client } from "@/lib/types";

type SortKey = "name" | "phone" | "birth" | "sales" | "created" | "updated";
type Dir = "asc" | "desc";

/** Sens proposé au premier clic sur une colonne (dates et nombres : les plus récents / grands d'abord). */
const FIRST_DIR: Record<SortKey, Dir> = { name: "asc", phone: "asc", birth: "asc", sales: "desc", created: "desc", updated: "desc" };
const LIMIT = 500;
const STORAGE_KEY = "bp.clientsSort";

export default function ClientsPage() {
  const can = useCan();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "name", dir: "asc" });
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tri mémorisé dans ce navigateur (par défaut : colonne Client, A → Z).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && saved.key in FIRST_DIR && (saved.dir === "asc" || saved.dir === "desc")) setSort(saved);
    } catch {
      /* stockage indisponible : tri par défaut */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<Client[]>(`/api/clients?q=${encodeURIComponent(q)}&sort=${sort.key}&dir=${sort.dir}&limit=${LIMIT}`)
        .then(setClients)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sort]);

  function toggle(key: SortKey) {
    const next = sort.key === key ? { key, dir: (sort.dir === "asc" ? "desc" : "asc") as Dir } : { key, dir: FIRST_DIR[key] };
    setSort(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* sans importance */
    }
  }

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <SortButton active={sort.key === key} dir={sort.dir} onClick={() => toggle(key)}>
        {label}
      </SortButton>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Comptes clients de la concession. Clique sur un titre de colonne pour trier."
        actions={
          can(PERM.clientsCreate) && (
            <Link href="/clients/nouveau">
              <Button>
                <Plus className="h-4 w-4" /> Nouveau client
              </Button>
            </Link>
          )
        }
      />
      <Card>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, prénom, téléphone…" className="pl-9" autoFocus />
        </div>
        <ErrorBox message={error} />
        {!clients ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <Empty>{q ? "Aucun client ne correspond." : "Aucun client pour le moment."}</Empty>
        ) : (
          <>
            <div className="-mx-5 overflow-x-auto">
              <table className="table-bp min-w-[760px]">
                <thead>
                  <tr>
                    {header("name", "Client", "pl-5")}
                    {header("phone", "Téléphone")}
                    {header("birth", "Naissance")}
                    {header("sales", "Ventes")}
                    {header("created", "Client depuis")}
                    {header("updated", "Mis à jour", "pr-5")}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const dob = typeof c.data.date_naissance === "string" ? c.data.date_naissance : null;
                    const age = ageFrom(dob);
                    return (
                      <tr key={c.id}>
                        <td className="pl-5">
                          <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                        </td>
                        <td className="tabular-nums">{c.data.telephone ? formatPhone(String(c.data.telephone)) : <span className="text-cream-dim">—</span>}</td>
                        <td>
                          {formatDate(dob)}
                          {age !== null && <span className="text-cream-dim"> · {age} ans</span>}
                        </td>
                        <td>
                          {c.saleCount}
                          {c.activeSaleCount > 0 && <span className="ml-2 text-xs text-sand">{c.activeSaleCount} en cours</span>}
                        </td>
                        <td className="text-xs text-cream-muted" title={formatDateTime(c.createdAt)}>
                          {formatDateTime(c.createdAt).slice(0, 10)}
                        </td>
                        <td className="pr-5 text-xs text-cream-muted">{formatRelative(c.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-cream-dim">
              {clients.length >= LIMIT
                ? `Affichage des ${LIMIT} premiers clients selon ce tri : utilise la recherche pour affiner.`
                : `${clients.length} client(s).`}
            </p>
          </>
        )}
      </Card>
    </>
  );
}

function SortButton({ active, dir, onClick, children }: { active: boolean; dir: Dir; onClick: () => void; children: ReactNode }) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-cream", active ? "text-cream" : "text-cream-muted")}
    >
      {children}
      <Icon className={cn("h-3.5 w-3.5", active ? "text-sand" : "opacity-40")} />
    </button>
  );
}
