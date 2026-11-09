"use client";

import { AlertTriangle, Cake, Target, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PhoneCopy } from "@/components/PhoneCopy";
import { SalesTable } from "@/components/SalesTable";
import { Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import { usePortal, useStatus } from "@/lib/portal-context";
import { ACTIVE_STATUSES, type BirthdayInfo, type GoalProgress, type Sale, type StatusCode } from "@/lib/types";

interface Dashboard {
  counts: Partial<Record<StatusCode, number>>;
  permitWarnings: number;
  immediatePending: number;
  goals: { from: string; to: string; items: GoalProgress[] };
  birthdays: BirthdayInfo[];
  birthdayCoupon: boolean;
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

      {(dash.goals.items.length > 0 || dash.birthdays.length > 0) && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {dash.goals.items.length > 0 && <GoalsCard goals={dash.goals} />}
          {dash.birthdays.length > 0 && <BirthdaysCard birthdays={dash.birthdays} coupon={dash.birthdayCoupon} />}
        </div>
      )}

      <Card title="Ventes en cours">
        <SalesTable sales={sales} empty="Aucune vente en cours. 🏜️" />
      </Card>
    </>
  );
}

function GoalsCard({ goals }: { goals: Dashboard["goals"] }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Target className="h-4 w-4 text-sand" /> Objectifs de la semaine
        </span>
      }
      actions={<span className="text-xs text-cream-dim">du {formatDate(goals.from).slice(0, 5)} au {formatDate(goals.to).slice(0, 5)}</span>}
    >
      <ul className="space-y-4">
        {goals.items.map((g) => {
          const pct = Math.min(100, Math.round((100 * g.current) / g.target));
          const done = g.current >= g.target;
          return (
            <li key={g.key}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span>{g.label}</span>
                <span className="tabular-nums">
                  <strong className={done ? "text-emerald-300" : "text-cream"}>{g.current}</strong>
                  <span className="text-cream-dim"> / {g.target}</span>
                  {done && " ✅"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-night-600">
                <div className={cn("h-full rounded-full", done ? "bg-paulie-green-bright" : "bg-sand")} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function BirthdaysCard({ birthdays, coupon }: { birthdays: BirthdayInfo[]; coupon: boolean }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Cake className="h-4 w-4 text-sand" /> Anniversaires (7 jours)
        </span>
      }
    >
      <ul className="space-y-2">
        {birthdays.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={cn("w-24 shrink-0 text-xs", b.daysUntil === 0 ? "font-semibold text-sand" : "text-cream-muted")}>
              {b.daysUntil === 0 ? "🎂 Aujourd'hui" : b.daysUntil === 1 ? "Demain" : formatDate(b.date).slice(0, 5)}
            </span>
            <Link href={`/clients/${b.id}`} className="font-medium hover:underline">
              {b.name}
            </Link>
            {b.age != null && <span className="text-xs text-cream-dim">{b.age} ans</span>}
            {b.phone && <PhoneCopy phone={b.phone} />}
            {b.coupon && <span className="text-xs text-emerald-300">coupon {b.coupon}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-cream-dim">
        {coupon
          ? "Un coupon d'anniversaire est créé automatiquement le jour J : bon prétexte pour appeler le client."
          : "Bon prétexte pour appeler le client. Le coupon d'anniversaire automatique peut être activé dans Configuration → Avantages clients."}
      </p>
    </Card>
  );
}

