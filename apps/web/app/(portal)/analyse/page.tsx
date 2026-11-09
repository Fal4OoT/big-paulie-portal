"use client";

import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PhoneCopy } from "@/components/PhoneCopy";
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { WeeklyRecapModal } from "@/components/WeeklyRecap";
import { api } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { InactiveClient, StatsData, StatsGroup } from "@/lib/types";

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
  const [recapOpen, setRecapOpen] = useState(false);
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
      <PageHeader
        title="Analyse"
        subtitle="Ventes non annulées, par date de vente (heure de Paris)."
        actions={
          <Button variant="secondary" onClick={() => setRecapOpen(true)}>
            <MessageSquareText className="h-4 w-4" /> Récap Discord
          </Button>
        }
      />
      {recapOpen && <WeeklyRecapModal open onClose={() => setRecapOpen(false)} current={{ from, to }} />}

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
            <DailyChart
              days={data.days}
              value={(d) => d[metric]}
              empty="Aucune vente sur la période."
              describe={(d) => `${d.count} vente(s) · ${formatMoney(d.revenue)}`}
            />
          </Card>

          <ClientsSection data={data} metric={metric} fmt={fmt} />

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

      <InactiveSection />
    </>
  );
}

const INACTIVE_KEY = "bp.inactiveWeeks";

/** Clients à relancer : déjà acheteurs, sans nouvel achat (ni commande en cours) depuis X semaines. Indépendant de la période. */
function InactiveSection() {
  const [weeks, setWeeks] = useState(4);
  const [rows, setRows] = useState<InactiveClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(INACTIVE_KEY));
      if (saved >= 1 && saved <= 104) setWeeks(saved);
    } catch {
      /* valeur par défaut */
    }
  }, []);

  useEffect(() => {
    setRows(null);
    setError(null);
    api
      .get<InactiveClient[]>(`/api/stats/inactive?weeks=${weeks}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Chargement impossible."));
  }, [weeks]);

  function change(v: number) {
    setWeeks(v);
    try {
      localStorage.setItem(INACTIVE_KEY, String(v));
    } catch {
      /* sans importance */
    }
  }

  return (
    <Card
      title="Clients à relancer"
      className="mt-6"
      actions={
        <span className="flex items-center gap-2 text-sm text-cream-muted">
          sans achat depuis
          <Select value={weeks} onChange={(e) => change(Number(e.target.value))} className="w-36">
            {[2, 4, 6, 8, 12, 26].map((w) => (
              <option key={w} value={w}>
                {w} semaines
              </option>
            ))}
          </Select>
        </span>
      }
    >
      <ErrorBox message={error} />
      {!rows ? (
        !error && <Spinner />
      ) : rows.length === 0 ? (
        <Empty>Aucun client à relancer sur cette durée. 👌</Empty>
      ) : (
        <>
          <p className="mb-3 text-xs text-cream-dim">
            Clients qui ont déjà acheté, sans nouvel achat ni commande en cours depuis {weeks} semaines. Les plus gros acheteurs d&apos;abord : une
            liste d&apos;appels toute prête pour les moments calmes.
          </p>
          <div className="-mx-5 overflow-x-auto">
            <table className="table-bp min-w-[640px]">
              <thead>
                <tr>
                  <th className="pl-5">Client</th>
                  <th>Téléphone</th>
                  <th className="text-right">Achats</th>
                  <th className="text-right">Total dépensé</th>
                  <th className="pr-5">Dernier achat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="pl-5">
                      <Link href={`/clients/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td>{r.phone ? <PhoneCopy phone={r.phone} /> : <span className="text-cream-dim">—</span>}</td>
                    <td className="text-right tabular-nums">{r.purchases}</td>
                    <td className="text-right tabular-nums">{formatMoney(r.total)}</td>
                    <td className="pr-5 text-xs text-cream-muted">
                      {formatDateTime(r.lastPurchaseAt).slice(0, 10)} · il y a {Math.floor((Date.now() - new Date(r.lastPurchaseAt).getTime()) / 86_400_000)} j
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length >= 100 && <p className="mt-3 text-xs text-cream-dim">Affichage des 100 premiers.</p>}
        </>
      )}
    </Card>
  );
}

/** Section « Clients » : nouveaux, acheteurs, fidèles, transformation, meilleurs clients. */
function ClientsSection({ data, metric, fmt }: { data: StatsData; metric: Metric; fmt: (g: StatsGroup) => string }) {
  const k = data.clients;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl uppercase tracking-wide text-sand">Clients</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Nouveaux clients enregistrés" value={`${k.newClients}`} hint={`${k.totalClients} clients au total`} />
        <Stat
          label="Clients acheteurs"
          value={`${k.buyers}`}
          hint={`${k.firstTimeBuyers} premier achat · ${k.returningBuyers} déjà clients`}
        />
        <Stat label="Ont acheté plusieurs fois" value={`${k.repeatBuyers}`} hint={`${pct(k.repeatBuyers, k.buyers)} des acheteurs`} />
        <Stat
          label="Nouveaux clients qui ont acheté"
          value={pct(k.newClientsConverted, k.newClients)}
          hint={`${k.newClientsConverted} sur ${k.newClients} enregistré(s)`}
        />
      </div>
      <p className="text-xs text-cream-dim">
        Montant moyen par client acheteur : {k.buyers > 0 ? formatMoney(Math.round(data.totals.revenue / k.buyers)) : "—"} · « Déjà clients » : clients
        dont le premier achat est antérieur à la période.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Nouveaux clients par jour">
          <DailyChart days={data.days} value={(d) => d.newClients} empty="Aucun nouveau client sur la période." describe={(d) => `${d.newClients} nouveau(x) client(s)`} />
        </Card>
        <Card title={metric === "count" ? "Meilleurs clients (nombre d'achats)" : "Meilleurs clients (montant)"}>
          <ClientBarList rows={data.topClients.slice(0, 10)} metric={metric} fmt={fmt} />
        </Card>
      </div>
    </section>
  );
}

function ClientBarList({ rows, metric, fmt }: { rows: StatsGroup[]; metric: Metric; fmt: (g: StatsGroup) => string }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b[metric] - a[metric] || a.label.localeCompare(b.label)), [rows, metric]);
  if (sorted.length === 0) return <Empty>Aucun achat sur la période.</Empty>;
  const max = Math.max(...sorted.map((r) => r[metric]), 1);
  return (
    <ul className="space-y-2.5">
      {sorted.map((r, i) => (
        <li key={r.detail ?? i} title={`${r.label} : ${r.count} achat(s) · ${formatMoney(r.revenue)}`}>
          <div className="mb-1 flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-cream-dim">{i + 1}</span>
            <Link href={`/clients/${r.detail}`} className="truncate hover:underline">
              {r.label || "Client sans nom"}
            </Link>
            <span className="ml-auto shrink-0 tabular-nums text-cream">{fmt(r)}</span>
          </div>
          <div className="ml-7 h-2 rounded-full bg-night-600/60">
            <div className="h-2 rounded-full bg-sand" style={{ width: `${Math.max(2, (r[metric] / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
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

type Day = StatsData["days"][number];

/** Colonnes par jour, avec infobulle au survol (zone de survol = toute la colonne). */
function DailyChart({ days, value, empty, describe }: { days: Day[]; value: (d: Day) => number; empty: string; describe: (d: Day) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map(value), 1);
  const total = days.reduce((s, d) => s + value(d), 0);
  if (total === 0) return <Empty>{empty}</Empty>;

  const labelEvery = Math.ceil(days.length / 12);
  const h = hover !== null ? days[hover] : null;

  return (
    <div>
      <div className="mb-2 h-5 text-sm text-cream-muted">
        {h ? (
          <>
            <span className="text-cream">{formatDate(h.date)}</span> · {describe(h)}
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
            aria-label={`${formatDate(d.date)} : ${describe(d)}`}
          >
            <div
              className={cn("w-full rounded-t-[4px] transition-colors", hover === i ? "bg-[#E8BC63]" : "bg-sand")}
              style={{ height: value(d) > 0 ? `${Math.max(2, (value(d) / max) * 100)}%` : 0 }}
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
