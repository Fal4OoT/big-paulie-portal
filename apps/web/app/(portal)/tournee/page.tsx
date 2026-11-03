"use client";

import { AlertTriangle, Clock, Megaphone, PackageCheck, ShoppingCart, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { PERM, useCan, useStatus } from "@/lib/portal-context";
import type { Sale, StatusCode, TourData } from "@/lib/types";

export default function TourPage() {
  const can = useCan();
  const status = useStatus();
  const [tour, setTour] = useState<TourData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const t = await api.get<TourData>("/api/tour");
      setTour(t);
      // Retire de la sélection ce qui a changé de colonne entre-temps.
      const ids = new Set([...t.toOrder, ...t.toFetch].map((s) => s.id));
      setSelected((prev) => new Set([...prev].filter((id) => ids.has(id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = setInterval(load, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  // Recharge juste après le passage de la tranche.
  useEffect(() => {
    if (tour && new Date(tour.nextSlotUtc).getTime() < now - 2000) void load();
  }, [now, tour, load]);

  async function bulk(ids: string[], to: StatusCode) {
    if (ids.length === 0) return;
    setBusy(to);
    setError(null);
    setInfo(null);
    try {
      const r = await api.post<{ updated: number; failed: number }>("/api/sales/bulk-status", { ids, to });
      setInfo(`${r.updated} vente(s) passée(s) en « ${status(to).label} »${r.failed ? ` · ${r.failed} ignorée(s) (déjà modifiées)` : ""}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function announce() {
    setBusy("announce");
    setError(null);
    try {
      await api.post("/api/tour/announce");
      setInfo("Liste envoyée dans le salon Discord de la tournée.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(null);
    }
  }

  if (!tour) return error ? <ErrorBox message={error} /> : <Spinner />;

  const remaining = Math.max(0, new Date(tour.nextSlotUtc).getTime() - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const canAdvance = can(PERM.salesAdvance);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectedIn = (list: Sale[]) => list.filter((s) => selected.has(s.id)).map((s) => s.id);

  return (
    <>
      <PageHeader
        title="Tournée"
        subtitle="Toutes les 30 minutes, on commande et on récupère tout ce qui attend. Les ventes immédiates passent avant."
        actions={
          canAdvance && (
            <Button variant="secondary" onClick={announce} loading={busy === "announce"}>
              <Megaphone className="h-4 w-4" /> Envoyer la liste sur Discord
            </Button>
          )
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-night-500/70 bg-night-800 px-5 py-4 shadow-sign">
        <Clock className="h-6 w-6 text-sand" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-cream-muted">Prochaine tournée</div>
          <div className="font-display text-3xl">{tour.nextSlotLabel}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs uppercase tracking-wider text-cream-muted">Dans</div>
          <div className="font-mono text-2xl tabular-nums">
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </div>
        </div>
      </div>

      {info && <div className="mb-4 rounded-md border border-paulie-green-bright/50 bg-paulie-green/20 px-4 py-3 text-sm">{info}</div>}
      <div className="mb-4">
        <ErrorBox message={error} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Column
          code="TO_ORDER"
          icon={<ShoppingCart className="h-5 w-5" />}
          sales={tour.toOrder}
          selectable={canAdvance}
          selected={selected}
          onToggle={toggle}
          onSelectAll={(ids) => setSelected((p) => new Set([...p, ...ids]))}
          action={
            canAdvance && (
              <Button size="sm" variant="green" loading={busy === "TO_FETCH"} disabled={selectedIn(tour.toOrder).length === 0} onClick={() => bulk(selectedIn(tour.toOrder), "TO_FETCH")}>
                Commandé → {status("TO_FETCH").label} ({selectedIn(tour.toOrder).length})
              </Button>
            )
          }
        />
        <Column
          code="TO_FETCH"
          icon={<Zap className="h-5 w-5" />}
          sales={tour.toFetch}
          selectable={canAdvance}
          selected={selected}
          onToggle={toggle}
          onSelectAll={(ids) => setSelected((p) => new Set([...p, ...ids]))}
          action={
            canAdvance && (
              <Button size="sm" variant="green" loading={busy === "RECEIVED"} disabled={selectedIn(tour.toFetch).length === 0} onClick={() => bulk(selectedIn(tour.toFetch), "RECEIVED")}>
                Récupéré → {status("RECEIVED").label} ({selectedIn(tour.toFetch).length})
              </Button>
            )
          }
        />
        <Column
          code="RECEIVED"
          icon={<PackageCheck className="h-5 w-5" />}
          sales={tour.received}
          hint="Ouvre la vente pour la livrer et renseigner la plaque."
        />
      </div>
    </>
  );
}

function Column({
  code,
  icon,
  sales,
  selectable,
  selected,
  onToggle,
  onSelectAll,
  action,
  hint,
}: {
  code: StatusCode;
  icon: ReactNode;
  sales: Sale[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
  action?: ReactNode;
  hint?: string;
}) {
  const s = useStatus()(code);
  return (
    <section className="flex flex-col rounded-xl border border-night-500/70 bg-night-800 shadow-sign" style={{ borderTopColor: s.color, borderTopWidth: 3 }}>
      <header className="flex items-center gap-2 border-b border-night-500/70 px-4 py-3">
        <span style={{ color: s.color }}>{icon}</span>
        <h2 className="font-display text-lg uppercase tracking-wide">{s.label}</h2>
        <span className="ml-1 rounded-full bg-night-600 px-2 text-xs font-semibold">{sales.length}</span>
        {selectable && sales.length > 0 && (
          <button onClick={() => onSelectAll?.(sales.map((x) => x.id))} className="ml-auto text-xs text-cream-muted hover:text-cream hover:underline">
            Tout cocher
          </button>
        )}
      </header>
      <div className="flex-1 space-y-2 p-3">
        {hint && sales.length > 0 && <p className="px-1 text-xs text-cream-dim">{hint}</p>}
        {sales.length === 0 ? (
          <Empty>Rien ici.</Empty>
        ) : (
          sales.map((sale) => (
            <div
              key={sale.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-night-900/60 px-3 py-2.5",
                sale.immediate ? "border-sunset/60" : "border-night-500/60",
                selected?.has(sale.id) && "ring-1 ring-sand",
              )}
            >
              {selectable && (
                <input
                  type="checkbox"
                  checked={selected?.has(sale.id) ?? false}
                  onChange={() => onToggle?.(sale.id)}
                  className="mt-1 h-4 w-4 accent-[#D9A441]"
                  aria-label={`Sélectionner ${sale.reference}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/ventes/${sale.id}`} className="font-medium hover:underline">
                    {sale.vehicleName}
                  </Link>
                  {sale.immediate && <Zap className="h-3.5 w-3.5 text-sunset" aria-label="Immédiat" />}
                  {sale.permitWarning && <AlertTriangle className="h-3.5 w-3.5 text-sand" aria-label="Permis manquant" />}
                </div>
                <div className="truncate text-xs text-cream-muted">
                  <span className="font-mono text-sand">{sale.reference}</span> · {sale.vehicleTypeLabel} · {sale.clientName}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {action && <footer className="border-t border-night-500/70 p-3">{action}</footer>}
    </section>
  );
}
