"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { usePortal } from "@/lib/portal-context";
import type { AdminConfig, GiftTier, PortalSettings } from "@/lib/types";
import { Badge, Button, Card, Input, Label, Select, Toggle } from "../ui";
import { SaveBar, stableJson } from "./SaveBar";

/** Réglages généraux. « section » choisit la partie affichée (onglets de la configuration), l'enregistrement envoie tout. */
export function SettingsEditor({
  admin,
  onSaved,
  section = "discord",
}: {
  admin: AdminConfig;
  onSaved: () => Promise<void>;
  section?: "discord" | "advantages";
}) {
  const { reloadConfig } = usePortal();
  const [s, setS] = useState<PortalSettings>(admin.settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty = stableJson(s) !== stableJson(admin.settings);
  const set = (patch: Partial<PortalSettings>) => {
    setDone(false);
    setS((x) => ({ ...x, ...patch }));
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put("/api/admin/settings", s);
      await Promise.all([onSaved(), reloadConfig()]);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const [lastAdmin, setLastAdmin] = useState(admin);
  if (lastAdmin !== admin) {
    setLastAdmin(admin);
    setS(admin.settings);
  }

  const channelSelect = (value: string | null, onChange: (v: string | null) => void) =>
    admin.discordChannels.length > 0 ? (
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Aucun —</option>
        {admin.discordChannels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
        {value && !admin.discordChannels.some((c) => c.id === value) && <option value={value}>Salon introuvable ({value})</option>}
      </Select>
    ) : (
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value.trim() || null)} placeholder="ID du salon" />
    );

  const roleSelect = (value: string | null, onChange: (v: string | null) => void) =>
    admin.discordRoles.length > 0 ? (
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Ne mentionner personne —</option>
        {admin.discordRoles.map((r) => (
          <option key={r.id} value={r.id}>
            @{r.name}
          </option>
        ))}
      </Select>
    ) : (
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value.trim() || null)} placeholder="ID du rôle (facultatif)" />
    );

  return (
    <div className="space-y-6">
      {section === "discord" && (
      <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Logs">
          <Label>Salon de logs</Label>
          {channelSelect(s.logChannelId, (v) => set({ logChannelId: v }))}
          <p className="mt-2 text-xs text-cream-dim">Chaque action du portail (clients, ventes, statuts, configuration) y est publiée avec son auteur.</p>
        </Card>

        <Card title="Tournées">
          <div className="space-y-4">
            <div>
              <Label>Salon de la tournée</Label>
              {channelSelect(s.tourChannelId, (v) => set({ tourChannelId: v }))}
            </div>
            <div>
              <Label>Rôle mentionné à chaque tournée</Label>
              {roleSelect(s.tourPingRoleId, (v) => set({ tourPingRoleId: v }))}
            </div>
            <div>
              <Label>Rôle mentionné pour une vente immédiate</Label>
              {roleSelect(s.immediatePingRoleId, (v) => set({ immediatePingRoleId: v }))}
            </div>
            <Toggle checked={s.tourEnabled} onChange={(v) => set({ tourEnabled: v })} label="Notification automatique toutes les 30 minutes (xxh00 et xxh30)" />
            <Toggle checked={s.tourSkipEmpty} onChange={(v) => set({ tourSkipEmpty: v })} label="Pas de notification quand il n'y a rien à commander ni à chercher" />
            <p className="text-xs text-cream-dim">
              Le salon contient un seul tableau, mis à jour en direct à chaque changement. À chaque tournée (et pour une vente immédiate), il est
              republié en bas du salon avec la mention des rôles : c'est ce qui envoie la notification.
            </p>
          </div>
        </Card>
      </div>

      <Card title="Retards">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>En retard après</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={48}
                value={s.tourLateAfter}
                onChange={(e) => set({ tourLateAfter: Math.max(0, Math.min(48, Number(e.target.value) || 0)) })}
                className="w-24"
              />
              <span className="text-sm text-cream-muted">
                tournée(s) d'attente{s.tourLateAfter > 0 ? ` (plus de ${s.tourLateAfter * 30} min)` : " — désactivé"}
              </span>
            </div>
          </div>
          <div>
            <Label>Grade / rôle mentionné en cas de retard</Label>
            {roleSelect(s.tourLateRoleId, (v) => set({ tourLateRoleId: v }))}
          </div>
        </div>
        <p className="mt-3 text-xs text-cream-dim">
          Un véhicule encore « à commander » ou « à chercher » au-delà de ce nombre de tournées est marqué ⏰ dans le tableau, et ce rôle est
          mentionné à chaque tournée tant qu'il reste des véhicules en retard. 0 désactive les retards.
        </p>
      </Card>

      </>
      )}

      {section === "advantages" && (
      <>
      <Card title="Coupons & fidélité">
        <div className="space-y-5">
          <div>
            <Label>Promotion maximum d'un coupon</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={100}
                value={s.couponMaxPercent}
                onChange={(e) => set({ couponMaxPercent: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                className="w-24"
              />
              <span className="text-sm text-cream-muted">%</span>
            </div>
            <p className="mt-1 text-xs text-cream-dim">
              Qui peut attribuer ou annuler un coupon se règle dans Grades & permissions.
            </p>
          </div>

          <Toggle checked={s.loyaltyEnabled} onChange={(v) => set({ loyaltyEnabled: v })} label="Programme de fidélité" />
          {s.loyaltyEnabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Un coupon tous les</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={100} value={s.loyaltyEvery} onChange={(e) => set({ loyaltyEvery: Math.max(1, Number(e.target.value) || 1) })} className="w-24" />
                  <span className="text-sm text-cream-muted">achats</span>
                </div>
              </div>
              <div>
                <Label>Promotion</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={s.couponMaxPercent}
                    value={s.loyaltyPercent}
                    onChange={(e) => set({ loyaltyPercent: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-24"
                  />
                  <span className="text-sm text-cream-muted">%</span>
                </div>
              </div>
              <div>
                <Label>Valable</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={s.loyaltyExpiryDays ?? ""}
                    placeholder="∞"
                    onChange={(e) => set({ loyaltyExpiryDays: e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1) })}
                    className="w-24"
                  />
                  <span className="text-sm text-cream-muted">jours (vide = sans expiration)</span>
                </div>
              </div>
              <p className="text-xs text-cream-dim sm:col-span-3">
                Toute vente non annulée compte, dès sa création. Exemple : tous les {s.loyaltyEvery} achats, le client reçoit un coupon de{" "}
                {s.loyaltyPercent} % dans sa liste. Si la vente qui l'a généré est annulée, le coupon est retiré tant qu'il n'a pas servi.
              </p>
            </div>
          )}

          <Toggle checked={s.referralEnabled} onChange={(v) => set({ referralEnabled: v })} label="Parrainage" />
          {s.referralEnabled && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Coupon du filleul</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={s.couponMaxPercent}
                    value={s.referralGodchildPercent}
                    onChange={(e) => set({ referralGodchildPercent: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-24"
                  />
                  <span className="text-sm text-cream-muted">%</span>
                </div>
              </div>
              <div>
                <Label>Coupon du parrain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={s.couponMaxPercent}
                    value={s.referralSponsorPercent}
                    onChange={(e) => set({ referralSponsorPercent: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-24"
                  />
                  <span className="text-sm text-cream-muted">%</span>
                </div>
              </div>
              <div>
                <Label>Valable</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={s.referralExpiryDays ?? ""}
                    placeholder="∞"
                    onChange={(e) => set({ referralExpiryDays: e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1) })}
                    className="w-24"
                  />
                  <span className="text-sm text-cream-muted">jours</span>
                </div>
              </div>
              <div>
                <Label>Filleuls par parrain</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={s.referralMaxGodchildren ?? ""}
                    placeholder="∞"
                    onChange={(e) => set({ referralMaxGodchildren: e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1) })}
                    className="w-24"
                  />
                  <span className="text-sm text-cream-muted">max</span>
                </div>
              </div>
              <p className="text-xs text-cream-dim sm:col-span-2 lg:col-span-4">
                Le filleul reçoit son coupon dès l'enregistrement du parrain (utilisable sur son premier achat). Le parrain reçoit le sien quand le
                premier achat du filleul est enregistré. Le parrain doit avoir une fiche client, le parrainage se fait avant le premier achat du filleul,
                et aucun parrainage croisé n'est possible. Vide = sans expiration / illimité.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Cadeaux à la livraison">
        <Toggle checked={s.giftsEnabled} onChange={(v) => set({ giftsEnabled: v })} label="Signaler le cadeau à remettre au passage en « Livré »" />
        <p className="mt-2 text-xs text-cream-dim">
          Selon le prix de vente saisi. Un seul cadeau : si plusieurs paliers correspondent, celui au montant minimum le plus élevé l'emporte. Montants inclus.
        </p>
        <div className="mt-4 space-y-3">
          {s.giftTiers.map((t, i) => {
            const upd = (patch: Partial<GiftTier>) => set({ giftTiers: s.giftTiers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="grid items-end gap-3 rounded-lg border border-night-500/70 bg-night-900/50 p-3 md:grid-cols-[1.4fr_1fr_1fr_1.2fr_auto]">
                <div>
                  <Label>Cadeau</Label>
                  <Input value={t.label} maxLength={60} onChange={(e) => upd({ label: e.target.value })} />
                </div>
                <div>
                  <Label>À partir de ($)</Label>
                  <Input type="number" min={0} value={t.min} onChange={(e) => upd({ min: Math.max(0, Number(e.target.value) || 0) })} />
                </div>
                <div>
                  <Label>Jusqu'à ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={t.max ?? ""}
                    placeholder="sans limite"
                    onChange={(e) => upd({ max: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
                <div>
                  <Label>Choix (séparés par des virgules)</Label>
                  <Input
                    value={t.choices.join(", ")}
                    placeholder="ex : Blanc, Rouge"
                    onChange={(e) => upd({ choices: e.target.value.split(",").map((x) => x.trimStart()) })}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => set({ giftTiers: s.giftTiers.filter((_, j) => j !== i) })}
                  title="Supprimer le palier"
                >
                  ×
                </Button>
              </div>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => set({ giftTiers: [...s.giftTiers, { label: "Nouveau cadeau", min: 0, max: null, choices: [] }] })}
          >
            + Ajouter un palier
          </Button>
        </div>
      </Card>

      </>
      )}

      {section === "discord" && (
      <Card title="Statuts des ventes">
        <p className="mb-4 text-sm text-cream-muted">
          Le circuit est fixe (la tournée et la livraison en dépendent), mais les libellés et couleurs sont libres.
        </p>
        <div className="space-y-3">
          {s.statuses.map((st, i) => (
            <div key={st.code} className="grid items-center gap-3 sm:grid-cols-[1fr_auto_auto]">
              <Input
                value={st.label}
                maxLength={40}
                onChange={(e) => set({ statuses: s.statuses.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              />
              <input
                type="color"
                value={st.color}
                onChange={(e) => set({ statuses: s.statuses.map((x, j) => (j === i ? { ...x, color: e.target.value.toUpperCase() } : x)) })}
                className="h-10 w-14 cursor-pointer rounded-md border border-night-500 bg-night-900"
                aria-label={`Couleur de ${st.label}`}
              />
              <Badge color={st.color}>{st.label || st.code}</Badge>
            </div>
          ))}
        </div>
      </Card>

      )}

      <SaveBar dirty={dirty} saving={saving} error={error} done={done} onSave={save} onReset={() => setS(admin.settings)} />
    </div>
  );
}
