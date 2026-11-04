"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { usePortal } from "@/lib/portal-context";
import type { VehicleCategory, VehicleType } from "@/lib/types";
import { Button, Card, Input, Label, Select } from "../ui";
import { SaveBar, stableJson } from "./SaveBar";


export function VehiclesEditor() {
  const { config, reloadConfig } = usePortal();
  const [cats, setCats] = useState<VehicleCategory[]>(config.categories);
  const [types, setTypes] = useState<VehicleType[]>(config.vehicleTypes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const initial = stableJson({ c: config.categories, t: config.vehicleTypes });
  const dirty = stableJson({ c: cats, t: types }) !== initial;
  const imageFields = config.clientFields.filter((f) => f.type === "image");

  // Identifiants temporaires côté navigateur pour relier un nouveau type à une nouvelle catégorie.
  function newId() {
    return crypto.randomUUID();
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put("/api/admin/vehicles", { categories: cats, types });
      await reloadConfig();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const [lastConfig, setLastConfig] = useState(config);
  if (lastConfig !== config) {
    setLastConfig(config);
    setCats(config.categories);
    setTypes(config.vehicleTypes);
  }

  const updCat = (i: number, p: Partial<VehicleCategory>) => {
    setDone(false);
    setCats((c) => c.map((x, j) => (j === i ? { ...x, ...p } : x)));
  };
  const updType = (i: number, p: Partial<VehicleType>) => {
    setDone(false);
    setTypes((t) => t.map((x, j) => (j === i ? { ...x, ...p } : x)));
  };

  return (
    <div className="space-y-6">
      <Card
        title="Catégories"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setCats((c) => [...c, { id: newId(), label: "Nouvelle catégorie", sortOrder: 0, active: true, requiresPlate: true }])}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        }
      >
        <p className="mb-4 text-sm text-cream-muted">
          Une catégorie n'est jamais supprimée (des ventes y sont liées) : désactive-la pour la masquer. « Plaque à la livraison » décide si la plaque est demandée au passage en Livré.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c, i) => (
            <div key={c.id} className={cn("space-y-3 rounded-lg border border-night-500/70 bg-night-900/50 p-3", !c.active && "opacity-60")}>
              <Input value={c.label} onChange={(e) => updCat(i, { label: e.target.value })} maxLength={40} />
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={c.active} onChange={(e) => updCat(i, { active: e.target.checked })} className="h-4 w-4 accent-[#2F7D53]" />
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={c.requiresPlate} onChange={(e) => updCat(i, { requiresPlate: e.target.checked })} className="h-4 w-4 accent-[#2F7D53]" />
                  Plaque à la livraison
                </label>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Types de véhicules"
        actions={
          <Button
            size="sm"
            variant="secondary"
            disabled={cats.length === 0}
            onClick={() =>
              setTypes((t) => [...t, { id: newId(), label: "Nouveau type", categoryId: cats.find((c) => c.active)?.id ?? cats[0].id, permitFieldKey: null, sortOrder: 0, active: true }])
            }
          >
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        }
      >
        <p className="mb-4 text-sm text-cream-muted">
          Le permis requis sert à afficher un avertissement si le client ne l'a pas sur sa fiche (la vente n'est jamais bloquée).
        </p>
        <div className="space-y-3">
          {types.map((t, i) => (
            <div key={t.id} className={cn("grid items-end gap-3 rounded-lg border border-night-500/70 bg-night-900/50 p-3 md:grid-cols-[1fr_1fr_1fr_auto]", !t.active && "opacity-60")}>
              <div>
                <Label>Type</Label>
                <Input value={t.label} onChange={(e) => updType(i, { label: e.target.value })} maxLength={40} />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select value={t.categoryId} onChange={(e) => updType(i, { categoryId: e.target.value })}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                      {!c.active ? " (désactivée)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Permis requis</Label>
                <Select value={t.permitFieldKey ?? ""} onChange={(e) => updType(i, { permitFieldKey: e.target.value || null })}>
                  <option value="">Aucun</option>
                  {imageFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={t.active} onChange={(e) => updType(i, { active: e.target.checked })} className="h-4 w-4 accent-[#2F7D53]" />
                Actif
              </label>
            </div>
          ))}
        </div>
      </Card>

      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        done={done}
        onSave={save}
        onReset={() => {
          setCats(config.categories);
          setTypes(config.vehicleTypes);
        }}
      />
    </div>
  );
}

