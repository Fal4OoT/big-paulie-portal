"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { SalesTable } from "@/components/SalesTable";
import { Card, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { usePortal } from "@/lib/portal-context";
import { ACTIVE_STATUSES, type Sale, type StatusCode } from "@/lib/types";

type Filter = "ACTIVE" | "ALL" | StatusCode;

export default function SalesPage() {
  const { config } = usePortal();
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [q, setQ] = useState("");
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("statut");
    if (s && config.statuses.some((x) => x.code === s)) setFilter(s as StatusCode);
  }, [config.statuses]);

  useEffect(() => {
    const status = filter === "ALL" ? "" : filter === "ACTIVE" ? ACTIVE_STATUSES.join(",") : filter;
    const t = setTimeout(() => {
      api
        .get<Sale[]>(`/api/sales?status=${status}&q=${encodeURIComponent(q)}`)
        .then(setSales)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [filter, q]);

  const chips: { key: Filter; label: string }[] = [
    { key: "ACTIVE", label: "En cours" },
    ...config.statuses.map((s) => ({ key: s.code as Filter, label: s.label })),
    { key: "ALL", label: "Toutes" },
  ];

  return (
    <>
      <PageHeader title="Ventes" subtitle="Pour créer une vente, ouvre la fiche du client." />
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                filter === c.key ? "border-sand bg-sand/15 text-cream" : "border-night-500 text-cream-muted hover:text-cream",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Référence (BP-0012), plaque, véhicule, client…" className="pl-9" />
        </div>
        <ErrorBox message={error} />
        {sales ? <SalesTable sales={sales} /> : <Spinner />}
      </Card>
    </>
  );
}
