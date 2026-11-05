"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { usePortal } from "@/lib/portal-context";
import type { AdminConfig, PartnerConfig } from "@/lib/types";
import { Button, Card, ErrorBox, Input, Label, Select, Spinner, Textarea, Toggle } from "../ui";
import { SaveBar, stableJson } from "./SaveBar";

/** Configuration des partenariats (garage de customisation…). */
export function PartnersEditor({ admin }: { admin: AdminConfig }) {
  const { config, reloadConfig } = usePortal();
  const [initial, setInitial] = useState<PartnerConfig[] | null>(null);
  const [list, setList] = useState<PartnerConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const r = await api.get<PartnerConfig[]>("/api/admin/partners");
    setInitial(r);
    setList(r);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  if (!initial) return error ? <ErrorBox message={error} /> : <Spinner />;

  const dirty = stableJson(list) !== stableJson(initial);
  const terrestre = config.categories.filter((c) => c.label === "Terrestre").map((c) => c.id);

  const upd = (i: number, patch: Partial<PartnerConfig>) => {
    setDone(false);
    setList((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  };

  async function remove(i: number) {
    const p = list[i];
    // Partenaire pas encore enregistré : on le retire simplement de la liste.
    if (!initial?.some((x) => x.id === p.id)) {
      setList((l) => l.filter((_, j) => j !== i));
      return;
    }
    if (dirty && !confirm("Tu as des modifications non enregistrées sur les partenariats : elles seront perdues. Continuer ?")) return;
    setError(null);
    try {
      const u = await api.get<{ name: string; validations: number; grades: string[] }>(`/api/admin/partners/${p.id}/usage`);
      const lines = [
        `Supprimer définitivement le partenariat « ${u.name} » ?`,
        "",
        u.validations > 0
          ? `• ${u.validations} customisation(s) validée(s) seront supprimées (historique et statistiques).`
          : "• Aucune customisation enregistrée.",
        u.grades.length > 0
          ? `• Grade(s) détaché(s) du partenaire, sans être supprimé(s) : ${u.grades.join(", ")}. Leurs comptes perdront l'accès à l'espace partenaire.`
          : "• Aucun grade relié.",
        "",
        "Pour garder l'historique, décoche plutôt « Actif ».",
      ];
      if (!confirm(lines.join("\n"))) return;
      await api.del(`/api/admin/partners/${p.id}`);
      await Promise.all([load(), reloadConfig()]);
      setDone(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put("/api/admin/partners", list);
      await Promise.all([load(), reloadConfig()]);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Partenariats"
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setList((l) => [
              ...l,
              {
                id: crypto.randomUUID(),
                name: "Nouveau partenaire",
                active: true,
                discountPercent: 10,
                windowHours: 24,
                categoryIds: terrestre,
                clientTerms: "",
                contractTerms: "",
                channelId: null,
              },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Ajouter un partenaire
        </Button>
      }
    >
      <p className="mb-4 text-sm text-cream-muted">
        Un client qui se présente chez le partenaire avec son véhicule dans le délai après la livraison obtient la réduction. Pour donner accès aux
        employés du partenaire : crée un grade dans <strong>Grades & permissions</strong>, relie-le à son rôle Discord et à ce partenaire, et coche
        « Espace partenaire » et « Valider une customisation ».
      </p>

      {list.length === 0 && <p className="text-sm text-cream-dim">Aucun partenaire.</p>}
      <div className="space-y-4">
        {list.map((p, i) => (
          <div key={p.id} className={cn("space-y-4 rounded-lg border border-night-500/70 bg-night-900/50 p-4", !p.active && "opacity-60")}>
            <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
              <div>
                <Label>Nom</Label>
                <Input value={p.name} maxLength={60} onChange={(e) => upd(i, { name: e.target.value })} />
              </div>
              <div>
                <Label>Réduction client</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={100} value={p.discountPercent} onChange={(e) => upd(i, { discountPercent: Math.max(1, Number(e.target.value) || 1) })} />
                  <span className="text-sm text-cream-muted">%</span>
                </div>
              </div>
              <div>
                <Label>Délai après livraison</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={720} value={p.windowHours} onChange={(e) => upd(i, { windowHours: Math.max(1, Number(e.target.value) || 1) })} />
                  <span className="text-sm text-cream-muted">h</span>
                </div>
              </div>
            </div>

            <div>
              <Label>Véhicules concernés</Label>
              <div className="flex flex-wrap gap-4 text-sm">
                {config.categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <label key={c.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.categoryIds.includes(c.id)}
                        onChange={(e) => upd(i, { categoryIds: e.target.checked ? [...p.categoryIds, c.id] : p.categoryIds.filter((x) => x !== c.id) })}
                        className="h-4 w-4 accent-[#2F7D53]"
                      />
                      {c.label}
                    </label>
                  ))}
              </div>
              {p.categoryIds.length === 0 && <p className="mt-1 text-xs text-sand">Aucune case cochée : tous les véhicules sont concernés.</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Précisions pour les clients (facultatif)</Label>
                <Textarea value={p.clientTerms} maxLength={2000} onChange={(e) => upd(i, { clientTerms: e.target.value })} placeholder="ex : sur présentation de la facture" />
              </div>
              <div>
                <Label>Ce que le partenaire offre à nos employés</Label>
                <Textarea
                  value={p.contractTerms}
                  maxLength={5000}
                  onChange={(e) => upd(i, { contractTerms: e.target.value })}
                  placeholder="ex : -15 % sur les réparations, dépannage gratuit pour les véhicules de service"
                />
              </div>
            </div>

            <div className="grid items-end gap-4 md:grid-cols-[1fr_auto]">
              {/* Salon Discord, puis Actif / Supprimer */}
              <div>
                <Label>Salon Discord du partenaire (nouveaux véhicules éligibles)</Label>
                {admin.discordChannels.length > 0 ? (
                  <Select value={p.channelId ?? ""} onChange={(e) => upd(i, { channelId: e.target.value || null })}>
                    <option value="">— Aucun —</option>
                    {admin.discordChannels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input value={p.channelId ?? ""} onChange={(e) => upd(i, { channelId: e.target.value.trim() || null })} placeholder="ID du salon" />
                )}
              </div>
              <div className="flex items-center gap-4">
                <Toggle checked={p.active} onChange={(v) => upd(i, { active: v })} label="Actif" />
                <Button type="button" size="sm" variant="danger" onClick={() => remove(i)} title="Supprimer le partenariat">
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SaveBar dirty={dirty} saving={saving} error={error} done={done} onSave={save} onReset={() => setList(initial)} />
    </Card>
  );
}
