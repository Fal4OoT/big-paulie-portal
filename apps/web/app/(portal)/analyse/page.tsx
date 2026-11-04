"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Empty, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, formatMoney } from "@/lib/format";
import type { StatsData, StatsGroup } from "@/lib/types";

type Preset = "7" | "30" | "90" | "custom";

/** Date du jour à Paris, au format AAAA-MM-JJ. */
function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function shift(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Metric = "count" | "revenue";

export default function AnalysePage() {
  const [preset, setPreset] = useState<Preset>("7");
  const [to, setTo] = useState(todayParis);
  const [from, setFrom] = useState(() => shift(todayParis(), -6));
  const [metric, setMetric] = useState<Metric>("count");
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const t = todayParis();
      setTo(t);
      setFrom(shift(t, -(Number(p) - 1)));
    }
  }

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    api
      .get<StatsData>(`/api/stats?from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to]);

  const fmt = (g: { count: number; revenue: number }) => (metric === "count" ? `${g.count}` : formatMoney(g.revenue));

  return (
    <>
      <PageHeader title="Analyse" subtitle="Ventes non annulées, par date de vente (heure de Paris)." />

      {/* Filtres : une seule ligne au-dessus des graphiques */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex overflow-hidden rounded-md border border-night-500">
          {(
            [
              ["7", "7 jours"],
              ["30", "30 jours"],
              ["90", "90 jours"],
              ["custom", "Personnalisé"],
            ] as [Preset, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={cn("px-3 py-2 text-sm transition-colors", preset === p ? "bg-paulie-red text-cream" : "text-cream-muted hover:bg-night-700 hover:text-cream")}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="Du" />
            <span className="text-cream-dim">→</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="Au" />
          </div>
        )}
        <div className="ml-auto flex overflow-hidden rounded-md border border-night-500">
          {(
            [
              ["count", "Nombre"],
              ["revenue", "Montant"],
            ] as [Metric, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn("px-3 py-2 text-sm transition-colors", metric === m ? "bg-night-600 text-cream" : "text-cream-muted hover:bg-night-700 hover:text-cream")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ErrorBox message={error} />
      {!data ? (
        <Spinner />
      ) : (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Ventes" value={`${data.totals.count}`} hint={data.totals.cancelled > 0 ? `${data.totals.cancelled} annulée(s) non comptée(s)` : undefined} />
            <Stat label="Montant des ventes" value={formatMoney(data.totals.revenue)} />
            <Stat label="Prix moyen" value={data.totals.averagePrice != null ? formatMoney(Math.round(data.totals.averagePrice)) : "—"} />
            <Stat
              label="Délai moyen de livraison"
              value={data.totals.avgDeliveryHours != null ? formatDuration(data.totals.avgDeliveryHours) : "—"}
              hint={`${data.totals.delivered} livrée(s) · ${data.totals.pending} en cours`}
            />
          </div>
          <p className="-mt-2 text-xs text-cream-dim">
            {data.totals.immediate} immédiate(s) · {data.totals.fromStock} depuis le stock · {data.totals.offCatalog} hors catalogue
          </p>

          <Card title={metric === "count" ? "Ventes par jour" : "Montant par jour"}>
            <DailyChart days={data.days} metric={metric} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Véhicules les plus vendus" className="lg:row-span-2">
              <BarList rows={data.vehicles} metric={metric} fmt={fmt} empty="Aucune vente sur la période." />
            </Card>
            <Card title="Par gamme">
              <BarList rows={data.segments} metric={metric} fmt={fmt} showDetailAsIcon />
            </Card>
            <Card title="Par type">
              <BarList rows={data.types} metric={metric} fmt={fmt} />
            </Card>
          </div>

          <Card title="Par vendeur">
            <BarList rows={data.sellers} metric={metric} fmt={fmt} />
          </Card>
        </div>
      )}
    </>
  );
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1).replace(".", ",")} h`;
  return `${(hours / 24).toFixed(1).replace(".", ",")} j`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-night-500/70 bg-night-800 p-5 shadow-sign">
      <div className="text-xs font-semibold uppercase tracking-wider text-cream-muted">{label}</div>
      <div className="mt-2 font-display text-3xl tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-cream-dim">{hint}</div>}
    </div>
  );
}

/** Barres horizontales triées : une seule teinte (grandeur), valeur en texte à droite. */
function BarList({
  rows,
  metric,
  fmt,
  empty = "Aucune donnée.",
  showDetailAsIcon,
}: {
  rows: StatsGroup[];
  metric: Metric;
  fmt: (g: StatsGroup) => string;
  empty?: string;
  showDetailAsIcon?: boolean;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b[metric] - a[metric] || a.label.localeCompare(b.label)), [rows, metric]);
  if (sorted.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(...sorted.map((r) => r[metric]), 1);
  return (
    <ul className="space-y-2.5">
      {sorted.map((r, i) => (
        <li key={`${r.label}-${r.detail}-${i}`} className="group" title={`${r.label} : ${r.count} vente(s) · ${formatMoney(r.revenue)}`}>
          <div className="mb-1 flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-cream-dim">{i + 1}</span>
            {showDetailAsIcon && r.detail && <span aria-hidden>{r.detail}</span>}
            <span className="truncate">{r.label}</span>
            {!showDetailAsIcon && r.detail && <span className="truncate text-xs text-cream-dim">{r.detail}</span>}
            <span className="ml-auto shrink-0 tabular-nums text-cream">{fmt(r)}</span>
          </div>
          <div className="ml-7 h-2 rounded-full bg-night-600/60">
            <div
              className="h-2 rounded-full bg-sand transition-all group-hover:bg-[#E8BC63]"
              style={{ width: `${Math.max(2, (r[metric] / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Colonnes par jour, avec infobulle au survol (zone de survol = toute la colonne). */
function DailyChart({ days, metric }: { days: StatsData["days"]; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d[metric]), 1);
  const total = days.reduce((s, d) => s + d[metric], 0);
  if (total === 0) return <Empty>Aucune vente sur la période.</Empty>;

  const labelEvery = Math.ceil(days.length / 12);
  const h = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="mb-2 h-5 text-sm text-cream-muted">
        {h ? (
          <>
            <span className="text-cream">{formatDate(h.date)}</span> · {h.count} vente(s) · {formatMoney(h.revenue)}
          </>
        ) : (
          "Survole une colonne pour le détail."
        )}
      </div>
      <div className="relative flex h-48 items-end gap-[2px] border-b border-night-500" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <div
            key={d.date}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            aria-label={`${formatDate(d.date)} : ${d.count} vente(s), ${formatMoney(d.revenue)}`}
          >
            <div
              className={cn("w-full rounded-t-[4px] transition-colors", hover === i ? "bg-[#E8BC63]" : "bg-sand")}
              style={{ height: d[metric] > 0 ? `${Math.max(2, (d[metric] / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-cream-dim">
        {days.map((d, i) => (
          <div key={d.date} className="flex-1 overflow-visible whitespace-nowrap text-center">
            {i % labelEvery === 0 ? formatDate(d.date).slice(0, 5) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
