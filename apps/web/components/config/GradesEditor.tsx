"use client";

import { Plus, Shield, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePortal } from "@/lib/portal-context";
import type { AdminConfig, Grade } from "@/lib/types";
import { Button, Card, Input, Label, Select } from "../ui";
import { SaveBar, stableJson } from "./SaveBar";

export function GradesEditor({ admin, onSaved }: { admin: AdminConfig; onSaved: () => Promise<void> }) {
  const { config } = usePortal();
  const initial = useMemo(() => [...admin.grades].sort((a, b) => b.priority - a.priority), [admin.grades]);
  const [grades, setGrades] = useState<Grade[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dirty = stableJson(grades) !== stableJson(initial);
  const groups = useMemo(() => {
    const map = new Map<string, typeof config.permissions>();
    for (const p of config.permissions) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map.entries()];
  }, [config.permissions]);

  const update = (i: number, patch: Partial<Grade>) => {
    setDone(false);
    setGrades((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const togglePerm = (i: number, key: string) => {
    const g = grades[i];
    update(i, { permissions: g.permissions.includes(key) ? g.permissions.filter((p) => p !== key) : [...g.permissions, key] });
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Priorité = ordre d'affichage (du plus haut au plus bas).
      const payload = grades.map((g, i) => ({ ...g, priority: (grades.length - i) * 100 }));
      await api.put("/api/admin/grades", payload);
      setDone(true);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const roleName = (id: string | null) => admin.discordRoles.find((r) => r.id === id)?.name;

  return (
    <div className="space-y-6">
      <Card
        title="Grades"
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setGrades((g) => [...g, { id: "00000000-0000-0000-0000-000000000000", name: "Nouveau grade", discordRoleId: null, priority: 0, isStaff: false, partnerId: null, permissions: [] }])
            }
          >
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        }
      >
        <p className="mb-4 text-sm text-cream-muted">
          Chaque grade est relié à un rôle Discord : un membre qui a ce rôle obtient les permissions du grade (cumulées s'il en a plusieurs).
          L'ordre sert à l'affichage, du plus haut au plus bas.
        </p>
        <div className="space-y-3">
          {grades.map((g, i) => (
            <div key={i} className="grid items-end gap-3 rounded-lg border border-night-500/70 bg-night-900/50 p-3 md:grid-cols-[1fr_1.2fr_1fr_auto_auto]">
              <div>
                <Label>Nom</Label>
                <Input value={g.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={40} />
              </div>
              <div>
                <Label>Rôle Discord</Label>
                {admin.discordRoles.length > 0 ? (
                  <Select value={g.discordRoleId ?? ""} onChange={(e) => update(i, { discordRoleId: e.target.value || null })}>
                    <option value="">— Aucun —</option>
                    {admin.discordRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                      </option>
                    ))}
                    {g.discordRoleId && !roleName(g.discordRoleId) && <option value={g.discordRoleId}>Rôle introuvable ({g.discordRoleId})</option>}
                  </Select>
                ) : (
                  <Input value={g.discordRoleId ?? ""} onChange={(e) => update(i, { discordRoleId: e.target.value.trim() || null })} placeholder="ID du rôle" />
                )}
              </div>
              <div>
                <Label>Partenaire</Label>
                <Select value={g.partnerId ?? ""} onChange={(e) => update(i, { partnerId: e.target.value || null })}>
                  <option value="">— Concession —</option>
                  {config.partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {g.partnerId && !config.partners.some((p) => p.id === g.partnerId) && <option value={g.partnerId}>Partenaire inactif</option>}
                </Select>
              </div>
              <label className="flex h-10 items-center gap-2 text-sm" title="Accès staff du serveur (hors grades de la concession)">
                <input type="checkbox" checked={g.isStaff} onChange={(e) => update(i, { isStaff: e.target.checked })} className="h-4 w-4 accent-[#D9A441]" />
                <Shield className="h-4 w-4 text-cream-muted" /> Staff
              </label>
              <div className="flex h-10 items-center gap-1">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setGrades((x) => swap(x, i, i - 1))} title="Monter">
                  ↑
                </Button>
                <Button size="sm" variant="ghost" disabled={i === grades.length - 1} onClick={() => setGrades((x) => swap(x, i, i + 1))} title="Descendre">
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => confirm(`Supprimer le grade « ${g.name} » ?`) && setGrades((x) => x.filter((_, j) => j !== i))}
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Matrice des permissions">
        <div className="-mx-5 overflow-x-auto">
          <table className="table-bp min-w-[640px]">
            <thead>
              <tr>
                <th className="pl-5">Permission</th>
                {grades.map((g, i) => (
                  <th key={i} className="text-center">
                    {g.name || "—"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, perms]) => (
                <Fragment key={group}>
                  <tr>
                    <td colSpan={grades.length + 1} className="bg-night-900/60 pl-5 text-xs font-semibold uppercase tracking-wider text-sand">
                      {group}
                    </td>
                  </tr>
                  {perms.map((p) => (
                    <tr key={p.key}>
                      <td className="pl-5">{p.label}</td>
                      {grades.map((g, i) => (
                        <td key={i} className="text-center">
                          <input
                            type="checkbox"
                            checked={g.permissions.includes(p.key)}
                            onChange={() => togglePerm(i, p.key)}
                            className="h-4 w-4 accent-[#2F7D53]"
                            aria-label={`${p.label} — ${g.name}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SaveBar dirty={dirty} saving={saving} error={error} done={done} onSave={save} onReset={() => setGrades(initial)} />
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const copy = [...arr];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}
