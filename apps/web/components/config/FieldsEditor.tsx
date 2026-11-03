"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePortal } from "@/lib/portal-context";
import type { FieldDefinition, FieldType } from "@/lib/types";
import { Button, Card, Input, Label, Select } from "../ui";
import { SaveBar, stableJson } from "./SaveBar";

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Texte court",
  textarea: "Texte long",
  phone: "Téléphone",
  date: "Date",
  number: "Nombre",
  checkbox: "Case à cocher",
  select: "Liste de choix",
  image: "Image à coller (PNG…)",
};

const EMPTY_ID = "00000000-0000-0000-0000-000000000000";

/** Clé technique dérivée du libellé : "Permis poids lourd" -> "permis_poids_lourd". */
function slugify(label: string) {
  return (
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "c_$1")
      .slice(0, 40) || "champ"
  );
}

export function FieldsEditor({ entity }: { entity: "client" | "sale" }) {
  const { config, reloadConfig } = usePortal();
  const initial = entity === "client" ? config.clientFields : config.saleFields;
  const [fields, setFields] = useState<(FieldDefinition & { isNew?: boolean })[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty = stableJson(fields) !== stableJson(initial);
  const usedAsPermit = useMemo(() => new Set(config.vehicleTypes.filter((t) => t.active).map((t) => t.permitFieldKey)), [config.vehicleTypes]);

  const update = (i: number, patch: Partial<FieldDefinition>) => {
    setDone(false);
    setFields((f) =>
      f.map((x, j) => {
        if (j !== i) return x;
        const next = { ...x, ...patch };
        // Pour un nouveau champ, la clé suit le libellé.
        if (x.isNew && patch.label !== undefined) next.key = uniqueKey(slugify(patch.label), f, j);
        return next;
      }),
    );
  };

  function add() {
    setFields((f) => [
      ...f,
      {
        id: EMPTY_ID,
        entity,
        key: uniqueKey("nouveau_champ", f, -1),
        label: "Nouveau champ",
        type: "text",
        required: false,
        sortOrder: 0,
        isSystem: false,
        options: [],
        help: null,
        isNew: true,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(
        `/api/admin/fields/${entity}`,
        fields.map(({ isNew: _isNew, ...f }) => f),
      );
      await reloadConfig();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  // Après enregistrement, la config rechargée remplace la copie de travail.
  const [lastInitial, setLastInitial] = useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setFields(initial);
  }

  return (
    <div>
      <Card
        title={entity === "client" ? "Modèle de la fiche client" : "Champs complémentaires de la vente"}
        actions={
          <Button size="sm" variant="secondary" onClick={add}>
            <Plus className="h-4 w-4" /> Ajouter un champ
          </Button>
        }
      >
        <p className="mb-4 text-sm text-cream-muted">
          {entity === "client"
            ? "Prénom, nom, téléphone et date de naissance sont des champs système (recherche, doublons) : leur libellé reste modifiable. Les permis sont des champs « image à coller »."
            : "Le véhicule, le type, le prix, l'option immédiate et la plaque sont fixes. Ajoute ici les informations en plus dont vous avez besoin."}
        </p>

        <div className="space-y-3">
          {fields.length === 0 && <p className="text-sm text-cream-dim">Aucun champ.</p>}
          {fields.map((f, i) => {
            const locked = f.isSystem;
            const permit = usedAsPermit.has(f.key);
            return (
              <div key={`${f.id}-${i}`} className="rounded-lg border border-night-500/70 bg-night-900/50 p-3">
                <div className="grid items-end gap-3 md:grid-cols-[1.4fr_1fr_auto_auto]">
                  <div>
                    <Label>Libellé</Label>
                    <Input value={f.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={60} />
                    <div className="mt-1 font-mono text-[11px] text-cream-dim">clé : {f.key}</div>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={f.type} disabled={!f.isNew} onChange={(e) => update(i, { type: e.target.value as FieldType })}>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    <div className="mt-1 text-[11px] text-cream-dim">{f.isNew ? " " : "Non modifiable après création"}</div>
                  </div>
                  <label className="flex h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={f.required}
                      disabled={locked && (f.key === "prenom" || f.key === "nom")}
                      onChange={(e) => update(i, { required: e.target.checked })}
                      className="h-4 w-4 accent-[#2F7D53]"
                    />
                    Obligatoire
                  </label>
                  <div className="flex h-10 items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setFields((x) => move(x, i, i - 1))} title="Monter">
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === fields.length - 1} onClick={() => setFields((x) => move(x, i, i + 1))} title="Descendre">
                      ↓
                    </Button>
                    {locked ? (
                      <span className="px-2 text-cream-dim" title="Champ système">
                        <Lock className="h-4 w-4" />
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={permit}
                        title={permit ? "Utilisé comme permis d'un type de véhicule" : "Supprimer"}
                        onClick={() =>
                          confirm(`Supprimer le champ « ${f.label} » ? Les valeurs déjà saisies sont conservées en base mais ne seront plus affichées.`) &&
                          setFields((x) => x.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {f.type === "select" && (
                    <div>
                      <Label>Options (une par ligne)</Label>
                      <textarea
                        value={f.options.join("\n")}
                        onChange={(e) => update(i, { options: e.target.value.split("\n") })}
                        className="min-h-[80px] w-full rounded-md border border-night-500 bg-night-900 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  <div>
                    <Label>Aide (facultatif)</Label>
                    <Input value={f.help ?? ""} onChange={(e) => update(i, { help: e.target.value || null })} maxLength={200} placeholder="Texte affiché sous le champ" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <SaveBar dirty={dirty} saving={saving} error={error} done={done} onSave={save} onReset={() => setFields(initial)} />
    </div>
  );
}

function uniqueKey(base: string, fields: FieldDefinition[], selfIndex: number) {
  let key = base;
  let n = 2;
  while (fields.some((f, j) => j !== selfIndex && f.key === key)) key = `${base}_${n++}`.slice(0, 40);
  return key;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
