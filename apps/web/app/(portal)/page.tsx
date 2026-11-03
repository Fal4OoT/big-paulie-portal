"use client";

import { AlertTriangle, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SalesTable } from "@/components/SalesTable";
import { Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { usePortal, useStatus } from "@/lib/portal-context";
import { ACTIVE_STATUSES, type Sale, type StatusCode } from "@/lib/types";

interface Dashboard {
  counts: Partial<Record<StatusCode, number>>;
  permitWarnings: number;
  immediatePending: number;
}

export default function DashboardPage() {
  const { me } = usePortal();
  const status = useStatus();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([api.get<Dashboard>("/api/dashboard"), api.get<Sale[]>(`/api/sales?status=${ACTIVE_STATUSES.join(",")}`)])
        .then(([d, s]) => {
          if (!alive) return;
          setDash(d);
          setSales(s);
        })
        .catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!dash || !sales) return <Spinner />;

  return (
    <>
      <PageHeader title={`Salut ${me.name.split(" ")[0]}`} subtitle="Ce qui attend la concession en ce moment." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["TO_ORDER", "TO_FETCH", "RECEIVED"] as StatusCode[]).map((code) => {
          const s = status(code);
          return (
            <Link
              key={code}
              href={`/ventes?statut=${code}`}
              className="group rounded-xl border border-night-500/70 bg-night-800 p-5 shadow-sign transition-colors hover:border-cream-dim"
              style={{ borderTopColor: s.color, borderTopWidth: 3 }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-cream-muted">{s.label}</div>
              <div className="mt-2 font-display text-4xl">{dash.counts[code] ?? 0}</div>
            </Link>
          );
        })}
        <div className="rounded-xl border border-night-500/70 bg-night-800 p-5 shadow-sign" style={{ borderTopColor: "#7C8A99", borderTopWidth: 3 }}>
          <div className="text-xs font-semibold uppercase tracking-wider text-cream-muted">{status("DELIVERED").label} (24 h)</div>
          <div className="mt-2 font-display text-4xl">{dash.counts.DELIVERED ?? 0}</div>
        </div>
      </div>

      {(dash.immediatePending > 0 || dash.permitWarnings > 0) && (
        <div className="mb-6 flex flex-wrap gap-3">
          {dash.immediatePending > 0 && (
            <Link href="/tournee" className="inline-flex items-center gap-2 rounded-md border border-sunset/60 bg-sunset/15 px-4 py-2 text-sm text-orange-100 hover:bg-sunset/25">
              <Zap className="h-4 w-4 text-sunset" /> {dash.immediatePending} vente(s) immédiate(s) à traiter
            </Link>
          )}
          {dash.permitWarnings > 0 && (
            <span className="inline-flex items-center gap-2 rounded-md border border-sand/50 bg-sand/10 px-4 py-2 text-sm text-amber-100">
              <AlertTriangle className="h-4 w-4 text-sand" /> {dash.permitWarnings} vente(s) en cours sans permis renseigné
            </span>
          )}
        </div>
      )}

      <Card title="Ventes en cours">
        <SalesTable sales={sales} empty="Aucune vente en cours. 🏜️" />
      </Card>
    </>
  );
}
