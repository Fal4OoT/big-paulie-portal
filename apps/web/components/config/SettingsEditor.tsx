"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { usePortal } from "@/lib/portal-context";
import type { AdminConfig, PortalSettings } from "@/lib/types";
import { Badge, Card, Input, Label, Select, Toggle } from "../ui";
import { SaveBar, stableJson } from "./SaveBar";

export function SettingsEditor({ admin, onSaved }: { admin: AdminConfig; onSaved: () => Promise<void> }) {
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
            <Toggle checked={s.tourEnabled} onChange={(v) => set({ tourEnabled: v })} label="Annonce automatique toutes les 30 minutes (xxh00 et xxh30)" />
            <Toggle checked={s.tourSkipEmpty} onChange={(v) => set({ tourSkipEmpty: v })} label="Ne rien envoyer quand il n'y a rien à faire" />
          </div>
        </Card>
      </div>

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

      <SaveBar dirty={dirty} saving={saving} error={error} done={done} onSave={save} onReset={() => setS(admin.settings)} />
    </div>
  );
}
