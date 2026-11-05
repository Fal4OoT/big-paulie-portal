"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatPhone } from "@/lib/format";
import { PERM, useCan, usePortal } from "@/lib/portal-context";
import type { Client, DataRecord, Duplicate } from "@/lib/types";
import { ClientSearch } from "./ClientSearch";
import { DynamicFields } from "./DynamicFields";
import { Button, ErrorBox, Label } from "./ui";

/** Formulaire client (création ou modification) avec détection des doublons. */
export function ClientForm({
  clientId,
  initial,
  onSaved,
  onCancel,
}: {
  clientId?: string;
  initial?: DataRecord;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const { config } = usePortal();
  const can = useCan();
  const [data, setData] = useState<DataRecord>(initial ?? {});
  const [sponsor, setSponsor] = useState<Client | null>(null);
  // Parrain choisi directement à la création de la fiche (le parrainage se fait avant le premier achat).
  const showSponsor = !clientId && config.referralEnabled && can(PERM.referralsManage);
  const [dups, setDups] = useState<Duplicate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vérifie les doublons dès que prénom + nom (+ date de naissance) sont saisis.
  const prenom = typeof data.prenom === "string" ? data.prenom.trim() : "";
  const nom = typeof data.nom === "string" ? data.nom.trim() : "";
  const dob = typeof data.date_naissance === "string" ? data.date_naissance : "";
  useEffect(() => {
    if (!prenom || !nom) {
      setDups([]);
      return;
    }
    const t = setTimeout(() => {
      const url = `/api/clients/duplicates${clientId ? `?excludeId=${clientId}` : ""}`;
      api
        .post<Duplicate[]>(url, { data: { prenom, nom, date_naissance: dob || null } })
        .then(setDups)
        .catch(() => setDups([]));
    }, 400);
    return () => clearTimeout(t);
  }, [prenom, nom, dob, clientId]);

  async function save(force: boolean) {
    setSaving(true);
    setError(null);
    try {
      if (clientId) {
        await api.put(`/api/clients/${clientId}`, { data, force });
        onSaved(clientId);
      } else {
        const res = await api.post<{ id: string }>("/api/clients", { data, force, sponsorId: showSponsor ? sponsor?.id ?? null : null });
        onSaved(res.id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.details)) {
        setDups(e.details as Duplicate[]);
        setError("Un client similaire existe déjà. Vérifie ci-dessus, puis confirme si c'est bien une autre personne.");
      } else {
        setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      }
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  const strong = dups.some((d) => d.strong);

  return (
    <form onSubmit={submit} className="space-y-6">
      <DynamicFields fields={config.clientFields} value={data} onChange={setData} />

      {showSponsor && (
        <div className="max-w-md">
          <Label>Parrain (facultatif)</Label>
          <ClientSearch value={sponsor} onSelect={setSponsor} placeholder="Rechercher le parrain parmi les clients…" />
          <p className="mt-1 text-xs text-cream-dim">Le nouveau client recevra son coupon de parrainage, utilisable dès son premier achat.</p>
        </div>
      )}

      {dups.length > 0 && (
        <div className={`rounded-md border px-4 py-3 text-sm ${strong ? "border-paulie-red/60 bg-paulie-red/15" : "border-sand/50 bg-sand/10"}`}>
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className={`h-4 w-4 ${strong ? "text-red-300" : "text-sand"}`} />
            {strong ? "Doublon probable" : "Client(s) au même nom"}
          </div>
          <ul className="mt-2 space-y-1">
            {dups.map((d) => (
              <li key={d.id}>
                <Link href={`/clients/${d.id}`} target="_blank" className="underline-offset-2 hover:underline">
                  {d.name}
                </Link>
                <span className="text-cream-muted">
                  {" "}
                  · né(e) le {formatDate(d.dateNaissance)}
                  {d.telephone ? ` · ${formatPhone(d.telephone)}` : ""}
                  {d.strong ? " · même date de naissance" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ErrorBox message={error} />

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        )}
        {dups.length > 0 && (
          <Button type="button" variant="secondary" loading={saving} onClick={() => save(true)}>
            C'est une autre personne, enregistrer
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {clientId ? "Enregistrer" : "Créer le client"}
        </Button>
      </div>
    </form>
  );
}
