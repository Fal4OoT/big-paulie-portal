"use client";

import { Gauge, Paintbrush, RotateCcw, Zap } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { cn, formatMoney } from "@/lib/format";
import type { Customization } from "@/lib/types";
import { Button, ErrorBox, Input, Label, Modal, Textarea } from "./ui";

type LevelKey = "engine" | "transmission" | "suspension" | "brakes";

const LEVEL_PARTS: { key: LevelKey; label: string }[] = [
  { key: "engine", label: "Moteur" },
  { key: "transmission", label: "Transmission" },
  { key: "suspension", label: "Suspension" },
  { key: "brakes", label: "Freins" },
];
const MAX_LEVEL = 6;

/** Montant saisi (« 12 000 », « 4500,50 ») → nombre, null si vide, NaN si invalide. */
function parseAmount(v: string): number | null {
  const t = v.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

/** Lignes de résumé : « 🎨 Cosmétique 12 000 $ », « ⚙️ Performance 35 000 $ : Moteur 4/6, Turbo… ». */
export function describeCustomization(c: Customization): string[] {
  const lines: string[] = [];
  if (c.cosmetic) lines.push(`🎨 Cosmétique${c.cosmeticAmount != null ? ` ${formatMoney(c.cosmeticAmount)}` : ""}`);
  if (c.performance) {
    const pieces: string[] = [];
    if (c.engine) pieces.push(`Moteur ${c.engine}/6`);
    if (c.turbo) pieces.push("Turbo");
    if (c.transmission) pieces.push(`Transmission ${c.transmission}/6`);
    if (c.suspension) pieces.push(`Suspension ${c.suspension}/6`);
    if (c.brakes) pieces.push(`Freins ${c.brakes}/6`);
    lines.push(
      `⚙️ Performance${c.performanceAmount != null ? ` ${formatMoney(c.performanceAmount)}` : ""}${pieces.length ? ` : ${pieces.join(", ")}` : ""}`,
    );
  }
  return lines;
}

/** Résumé compact d'une customisation (sous le véhicule, dans les historiques). */
export function CustomizationSummary({ value, className }: { value: Customization; className?: string }) {
  const lines = describeCustomization(value);
  if (lines.length === 0) return null;
  return (
    <div className={cn("space-y-0.5 text-xs text-cream-muted", className)}>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

export interface CustomizationTarget {
  /** Création : id de la vente. Modification : id de la validation. */
  saleId?: string;
  validationId?: string;
  vehicleName: string;
  plate: string | null;
  clientName: string;
  initial?: Customization & { amount: number | null; note: string | null };
}

/** Saisie d'une customisation par le garage (validation ou correction). Tout est facultatif. */
export function CustomizationModal({
  target,
  discount,
  onClose,
  onDone,
}: {
  target: CustomizationTarget;
  discount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const init = target.initial;
  const [cosmetic, setCosmetic] = useState(!!init?.cosmetic);
  const [cosmeticAmount, setCosmeticAmount] = useState(str(init?.cosmeticAmount));
  const [performance, setPerformance] = useState(!!init?.performance);
  const [performanceAmount, setPerformanceAmount] = useState(str(init?.performanceAmount));
  const [checked, setChecked] = useState<Record<LevelKey, boolean>>({
    engine: !!init?.engine,
    transmission: !!init?.transmission,
    suspension: !!init?.suspension,
    brakes: !!init?.brakes,
  });
  const [levels, setLevels] = useState<Record<LevelKey, number | null>>({
    engine: init?.engine ?? null,
    transmission: init?.transmission ?? null,
    suspension: init?.suspension ?? null,
    brakes: init?.brakes ?? null,
  });
  const [turbo, setTurbo] = useState(!!init?.turbo);
  // Total : calculé (cosmétique + performance) tant qu'il n'est pas saisi à la main.
  const [total, setTotal] = useState(str(init?.amount));
  const [totalManual, setTotalManual] = useState(init != null && init.amount != null);
  const [note, setNote] = useState(init?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ca = cosmetic ? parseAmount(cosmeticAmount) : null;
  const pa = performance ? parseAmount(performanceAmount) : null;
  const okCa = ca != null && !Number.isNaN(ca) ? ca : null;
  const okPa = pa != null && !Number.isNaN(pa) ? pa : null;
  const autoTotal = okCa == null && okPa == null ? null : (okCa ?? 0) + (okPa ?? 0);
  const shownTotal = totalManual ? total : autoTotal == null ? "" : String(Math.round(autoTotal * 100) / 100);

  function toggleLevelPart(key: LevelKey, on: boolean) {
    setChecked((c) => ({ ...c, [key]: on }));
    if (!on) setLevels((l) => ({ ...l, [key]: null }));
  }

  function setLevel(key: LevelKey, level: number) {
    setPerformance(true);
    setChecked((c) => ({ ...c, [key]: true }));
    setLevels((l) => ({ ...l, [key]: level }));
  }

  function fullPerf() {
    setPerformance(true);
    setChecked({ engine: true, transmission: true, suspension: true, brakes: true });
    setLevels({ engine: MAX_LEVEL, transmission: MAX_LEVEL, suspension: MAX_LEVEL, brakes: MAX_LEVEL });
    setTurbo(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (Number.isNaN(ca)) return setError("Montant cosmétique invalide.");
    if (Number.isNaN(pa)) return setError("Montant performance invalide.");
    const t = parseAmount(shownTotal);
    if (Number.isNaN(t)) return setError("Montant total invalide.");
    if (performance) {
      const missing = LEVEL_PARTS.find((p) => checked[p.key] && !levels[p.key]);
      if (missing) return setError(`Choisis le niveau : ${missing.label}.`);
    }

    const body = {
      amount: t,
      note: note.trim() || null,
      cosmetic,
      cosmeticAmount: ca,
      performance,
      performanceAmount: pa,
      engine: performance && checked.engine ? levels.engine : null,
      turbo: performance && turbo,
      transmission: performance && checked.transmission ? levels.transmission : null,
      suspension: performance && checked.suspension ? levels.suspension : null,
      brakes: performance && checked.brakes ? levels.brakes : null,
    };
    setSaving(true);
    try {
      if (target.validationId) await api.put(`/api/partner/validations/${target.validationId}`, body);
      else await api.post(`/api/partner/sales/${target.saleId}/validate`, body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const box = "rounded-lg border border-night-500/70 bg-night-900/50 p-3";

  return (
    <Modal open onClose={onClose} title={target.validationId ? "Modifier la customisation" : "Customisation effectuée"} wide>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-cream-muted">
          <strong className="text-cream">{target.vehicleName}</strong>
          {target.plate && <> · {target.plate}</>} · {target.clientName}
          <span className="block text-xs text-cream-dim">
            Tout est facultatif. Montants facturés réduction de {discount} % comprise ($).
          </span>
        </p>

        {/* Cosmétique */}
        <div className={box}>
          <label className="flex cursor-pointer items-center gap-2 font-medium">
            <input type="checkbox" checked={cosmetic} onChange={(e) => setCosmetic(e.target.checked)} className="h-4 w-4 accent-[#D9A441]" />
            <Paintbrush className="h-4 w-4 text-sand" /> Cosmétique
          </label>
          <div className="mt-2 sm:w-64">
            <Input
              inputMode="decimal"
              value={cosmeticAmount}
              onChange={(e) => setCosmeticAmount(e.target.value)}
              disabled={!cosmetic}
              placeholder="Montant cosmétique"
              aria-label="Montant cosmétique"
            />
          </div>
        </div>

        {/* Performance */}
        <div className={box}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 font-medium">
              <input type="checkbox" checked={performance} onChange={(e) => setPerformance(e.target.checked)} className="h-4 w-4 accent-[#D9A441]" />
              <Gauge className="h-4 w-4 text-sand" /> Performance
            </label>
            <Button type="button" size="sm" variant="secondary" onClick={fullPerf} className="ml-auto">
              <Zap className="h-4 w-4" /> Full perf
            </Button>
          </div>
          <div className="mt-2 sm:w-64">
            <Input
              inputMode="decimal"
              value={performanceAmount}
              onChange={(e) => setPerformanceAmount(e.target.value)}
              disabled={!performance}
              placeholder="Montant performance"
              aria-label="Montant performance"
            />
          </div>

          <div className={cn("mt-3 space-y-2", !performance && "pointer-events-none opacity-40")} aria-disabled={!performance}>
            {LEVEL_PARTS.map((p) => (
              <div key={p.key} className="flex flex-wrap items-center gap-3">
                <label className="flex w-36 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked[p.key]}
                    onChange={(e) => toggleLevelPart(p.key, e.target.checked)}
                    disabled={!performance}
                    className="h-4 w-4 accent-[#D9A441]"
                  />
                  {p.label}
                </label>
                <div className="flex gap-1" role="radiogroup" aria-label={`Niveau ${p.label}`}>
                  {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      role="radio"
                      aria-checked={levels[p.key] === lvl}
                      disabled={!performance}
                      onClick={() => setLevel(p.key, lvl)}
                      className={cn(
                        "h-8 w-8 rounded-md border text-sm tabular-nums transition-colors",
                        levels[p.key] === lvl
                          ? "border-sand bg-sand/25 text-cream"
                          : checked[p.key]
                            ? "border-night-500 text-cream-muted hover:text-cream"
                            : "border-night-600 text-cream-dim",
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label className="flex w-36 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={turbo} onChange={(e) => setTurbo(e.target.checked)} disabled={!performance} className="h-4 w-4 accent-[#D9A441]" />
              Turbo
            </label>
          </div>
        </div>

        {/* Total */}
        <div>
          <Label htmlFor="pv-total">Montant total facturé ($)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="pv-total"
              inputMode="decimal"
              value={shownTotal}
              onChange={(e) => {
                setTotalManual(true);
                setTotal(e.target.value);
              }}
              placeholder="ex : 47000"
              className="sm:w-64"
            />
            {totalManual && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setTotalManual(false)} title="Revenir au calcul automatique">
                <RotateCcw className="h-4 w-4" /> Calcul auto
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-cream-dim">
            {totalManual ? "Saisi à la main." : "Calculé automatiquement (cosmétique + performance), modifiable à la main."}
          </p>
        </div>

        <div>
          <Label htmlFor="pv-note">Note (facultative)</Label>
          <Textarea id="pv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="ex : peinture nacrée + jantes" />
        </div>

        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" variant="green" loading={saving}>
            {target.validationId ? "Enregistrer" : "Valider"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
