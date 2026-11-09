"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
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

type PeriodKey = "lastWeek" | "thisWeek" | "current";

interface Options {
  amounts: boolean;
  sellers: boolean;
  vehicles: boolean;
  clients: boolean;
  compare: boolean;
  goals: boolean;
}

const DEFAULT_OPTIONS: Options = { amounts: true, sellers: true, vehicles: true, clients: true, compare: true, goals: true };
const OPTIONS_KEY = "bp.recapOptions";
const DISCORD_LIMIT = 2000;

export function WeeklyRecapModal({ open, onClose, current }: { open: boolean; onClose: () => void; current: { from: string; to: string } }) {
  const [period, setPeriod] = useState<PeriodKey>("lastWeek");
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const can = useCan();
  const [text, setText] = useState<string | null>(null);
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
    setText(null);
    setError(null);
    setCopied(false);
    const q = new URLSearchParams({ from: range.from, to: range.to });
    (Object.keys(options) as (keyof Options)[]).forEach((k) => q.set(k, String(options[k])));
    let cancelled = false;
    api
      .get<{ text: string }>(`/api/stats/recap?${q}`)
      .then((r) => !cancelled && setText(r.text))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Chargement impossible."));
    return () => {
      cancelled = true;
    };
  }, [open, range, options]);

  function toggle(k: keyof Options) {
    const next = { ...options, [k]: !options[k] };
    setOptions(next);
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(next));
    } catch {
      /* sans importance */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? "");
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
    { key: "goals", label: "Objectifs (semaine)" },
  ];
  const length = text?.length ?? 0;
  const tooLong = length > DISCORD_LIMIT;

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
        {text === null ? (
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
                {length} / {DISCORD_LIMIT} caractères{tooLong && " : trop long pour un seul message Discord, décoche une section."}
              </span>
              <Button onClick={copy} variant={copied ? "green" : "primary"}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copié !" : "Copier"}
              </Button>
            </div>
            <p className="text-xs text-cream-dim">Colle ensuite le message dans ton salon Discord (Ctrl+V). La mise en forme (titres, gras) s&apos;affiche une fois envoyé.
              {can(PERM.configManage) && " L'envoi automatique chaque semaine se règle dans Configuration → Discord, tournée & statuts."}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
