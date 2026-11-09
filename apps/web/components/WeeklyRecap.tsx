"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import type { StatsData } from "@/lib/types";
import { Button, ErrorBox, Modal, Spinner } from "./ui";

/** Date du jour à Paris (AAAA-MM-JJ). */
function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function shift(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant cette date. */
function monday(ymd: string): string {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return shift(ymd, -((dow + 6) % 7));
}

function days(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1;
}

type PeriodKey = "lastWeek" | "thisWeek" | "current";

interface Options {
  amounts: boolean;
  sellers: boolean;
  vehicles: boolean;
  clients: boolean;
  compare: boolean;
}

const DEFAULT_OPTIONS: Options = { amounts: true, sellers: true, vehicles: true, clients: true, compare: true };
const OPTIONS_KEY = "bp.recapOptions";
const DISCORD_LIMIT = 2000;

/** Montant compact pour Discord : 1 250 000 $ → 1,25 M$ ; 45 000 $ → 45 k$. */
function money(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M$`;
  if (v >= 10_000) return `${Math.round(v / 1000).toLocaleString("fr-FR")} k$`;
  return `${Math.round(v).toLocaleString("fr-FR")} $`;
}

function evolution(now: number, before: number): string {
  if (before === 0) return now > 0 ? " (nouveau)" : "";
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return " (=)";
  return pct > 0 ? ` (▲ +${pct} %)` : ` (▼ ${-pct} %)`;
}

function duration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1).replace(".", ",")} h`;
  return `${(hours / 24).toFixed(1).replace(".", ",")} j`;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** « 1 vente », « 3 ventes ». */
function pl(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Construit le message Discord à partir des statistiques de la période (et de la précédente pour comparer). */
export function buildRecap(cur: StatsData, prev: StatsData | null, o: Options): string {
  const t = cur.totals;
  const cmp = (a: number, b: number) => (o.compare && prev ? evolution(a, b) : "");
  const lines: string[] = [];
  const single = cur.from === cur.to;
  lines.push(`# 📊 Récap Big Paulie`);
  lines.push(single ? `**${formatDate(cur.from)}**` : `**Du ${formatDate(cur.from)} au ${formatDate(cur.to)}**`);
  lines.push("");

  lines.push(`## 🚗 Ventes`);
  lines.push(`• **${pl(t.count, "véhicule vendu", "véhicules vendus")}**${cmp(t.count, prev?.totals.count ?? 0)}`);
  if (o.amounts) {
    lines.push(`• **${money(t.revenue)}** de ventes${cmp(t.revenue, prev?.totals.revenue ?? 0)}`);
    if (t.averagePrice != null) lines.push(`• Prix moyen : **${money(t.averagePrice)}**`);
  }
  lines.push(
    `• **${pl(t.delivered, "livré", "livrés")}**${t.avgDeliveryHours != null ? ` · délai moyen **${duration(t.avgDeliveryHours)}**` : ""}${t.pending > 0 ? ` · ${t.pending} encore en cours` : ""}`,
  );
  if (t.immediate + t.fromStock > 0) lines.push(`• ⚡ ${pl(t.immediate, "immédiat", "immédiats")} · 📦 ${t.fromStock} depuis le stock`);
  lines.push("");

  if (o.vehicles && cur.vehicles.length > 0) {
    lines.push(`## 🏆 Top véhicules`);
    cur.vehicles.slice(0, 5).forEach((v, i) => {
      lines.push(`${i + 1}. **${v.label}** · ${pl(v.count, "vente", "ventes")}${o.amounts ? ` · ${money(v.revenue)}` : ""}`);
    });
    lines.push("");
  }

  if (o.sellers && cur.sellers.length > 0) {
    lines.push(`## 👔 Vendeurs`);
    const sorted = [...cur.sellers].sort((a, b) => b.count - a.count || b.revenue - a.revenue);
    sorted.slice(0, 5).forEach((s, i) => {
      lines.push(`${MEDALS[i] ?? `${i + 1}.`} **${s.label}** · ${pl(s.count, "vente", "ventes")}${o.amounts ? ` · ${money(s.revenue)}` : ""}`);
    });
    lines.push("");
  }

  if (o.clients) {
    const k = cur.clients;
    lines.push(`## 👥 Clients`);
    lines.push(`• **${pl(k.newClients, "nouveau client enregistré", "nouveaux clients enregistrés")}**${cmp(k.newClients, prev?.clients.newClients ?? 0)}`);
    lines.push(`• **${pl(k.buyers, "client acheteur", "clients acheteurs")}** : ${k.firstTimeBuyers} premier achat · ${k.returningBuyers} déjà clients`);
    if (k.repeatBuyers > 0) lines.push(`• ${k.repeatBuyers > 1 ? `${k.repeatBuyers} clients ont` : "1 client a"} acheté plusieurs fois 🔁`);
    lines.push("");
  }

  lines.push(t.count > 0 ? `Merci à toute l'équipe, on continue comme ça ! 💪` : `On se rattrape la semaine prochaine ! 💪`);
  return lines.join("\n");
}

export function WeeklyRecapModal({ open, onClose, current }: { open: boolean; onClose: () => void; current: { from: string; to: string } }) {
  const [period, setPeriod] = useState<PeriodKey>("lastWeek");
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [cur, setCur] = useState<StatsData | null>(null);
  const [prev, setPrev] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "null");
      if (saved && typeof saved === "object") setOptions({ ...DEFAULT_OPTIONS, ...saved });
    } catch {
      /* options par défaut */
    }
  }, []);

  const range = useMemo(() => {
    const today = todayParis();
    if (period === "thisWeek") return { from: monday(today), to: today };
    if (period === "lastWeek") {
      const m = shift(monday(today), -7);
      return { from: m, to: shift(m, 6) };
    }
    return current;
  }, [period, current]);

  useEffect(() => {
    if (!open) return;
    setCur(null);
    setError(null);
    setCopied(false);
    // Période précédente de même durée, juste avant (pour la comparaison).
    const n = days(range.from, range.to);
    const prevTo = shift(range.from, -1);
    const prevFrom = shift(prevTo, -(n - 1));
    Promise.all([
      api.get<StatsData>(`/api/stats?from=${range.from}&to=${range.to}`),
      api.get<StatsData>(`/api/stats?from=${prevFrom}&to=${prevTo}`).catch(() => null),
    ])
      .then(([c, p]) => {
        setCur(c);
        setPrev(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Chargement impossible."));
  }, [open, range]);

  const text = useMemo(() => (cur ? buildRecap(cur, prev, options) : ""), [cur, prev, options]);

  function toggle(k: keyof Options) {
    const next = { ...options, [k]: !options[k] };
    setOptions(next);
    setCopied(false);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      /* sans importance */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Navigateur sans accès au presse-papiers : on sélectionne le texte pour Ctrl+C.
      const el = document.getElementById("recap-text") as HTMLTextAreaElement | null;
      el?.select();
      setError("Copie automatique impossible : le texte est sélectionné, fais Ctrl+C.");
    }
  }

  const periods: { key: PeriodKey; label: string }[] = [
    { key: "lastWeek", label: "Semaine dernière" },
    { key: "thisWeek", label: "Semaine en cours" },
    { key: "current", label: "Période affichée" },
  ];
  const opts: { key: keyof Options; label: string }[] = [
    { key: "amounts", label: "Montants en $" },
    { key: "compare", label: "Comparaison avec la période précédente" },
    { key: "vehicles", label: "Top véhicules" },
    { key: "sellers", label: "Classement des vendeurs" },
    { key: "clients", label: "Clients" },
  ];
  const tooLong = text.length > DISCORD_LIMIT;

  return (
    <Modal open={open} onClose={onClose} title="Récap Discord" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                period === p.key ? "border-sand bg-sand/15 text-cream" : "border-night-500 text-cream-muted hover:text-cream",
              )}
            >
              {p.label}
            </button>
          ))}
          <span className="self-center text-xs text-cream-dim">
            {formatDate(range.from)} → {formatDate(range.to)}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {opts.map((o) => (
            <label key={o.key} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={options[o.key]} onChange={() => toggle(o.key)} className="h-4 w-4 accent-[#D9A441]" />
              {o.label}
            </label>
          ))}
        </div>

        <ErrorBox message={error} />
        {!cur ? (
          !error && <Spinner label="Calcul du récap…" />
        ) : (
          <>
            <textarea
              id="recap-text"
              readOnly
              value={text}
              className="h-80 w-full rounded-md border border-night-500 bg-night-900 px-3 py-2 font-mono text-xs text-cream focus:border-sand focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={cn("text-xs", tooLong ? "text-red-300" : "text-cream-dim")}>
                {text.length} / {DISCORD_LIMIT} caractères{tooLong && " : trop long pour un seul message, décoche une section."}
              </span>
              <Button onClick={copy} variant={copied ? "green" : "primary"}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copié !" : "Copier"}
              </Button>
            </div>
            <p className="text-xs text-cream-dim">Colle ensuite le message dans ton salon Discord (Ctrl+V). La mise en forme (titres, gras) s'affiche une fois envoyé.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
