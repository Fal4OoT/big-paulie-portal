"use client";

import { Check, Clock, Handshake, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { Client, ClientReferral as ReferralData } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Input, Modal, Spinner } from "./ui";

/** Bloc « Parrainage » de la fiche client : parrain du client et liste de ses filleuls. */
export function ClientReferral({ clientId, onChanged }: { clientId: string; onChanged?: () => void }) {
  const can = useCan();
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<ReferralData>(`/api/clients/${clientId}/referral`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!data?.sponsor) return;
    const effect = data.afterPurchase
      ? "Le coupon de l'ancien parrain sera annulé s'il ne l'a pas encore utilisé."
      : "Le coupon de parrainage du filleul sera annulé.";
    if (!confirm(`Retirer le parrain ${data.sponsor.name} ? ${effect}`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/clients/${clientId}/sponsor`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <ErrorBox message={error} /> : null;
  // Rien à afficher si le parrainage est désactivé et que le client n'a ni parrain ni filleul.
  if (!data.enabled && !data.sponsor && data.godchildren.length === 0) return null;

  const manage = can(PERM.referralsManage);
  const max = data.maxGodchildren;

  return (
    <Card title={<span className="flex items-center gap-2">Parrainage</span>}>
      <ErrorBox message={error} />
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream-muted">Parrain</div>
          {data.sponsor ? (
            <div className="rounded-lg border border-night-500/70 bg-night-900/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-sand" />
                <span>
                  Parrainé(e) par{" "}
                  <Link href={`/clients/${data.sponsor.id}`} className="font-semibold text-sand hover:underline">
                    {data.sponsor.name}
                  </Link>
                </span>
                {manage && data.canChangeSponsor && (
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => setPickerOpen(true)} disabled={busy} className="rounded p-1 text-cream-dim hover:bg-night-700 hover:text-cream" title="Changer de parrain">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={remove} disabled={busy} className="rounded p-1 text-cream-dim hover:bg-paulie-red/20 hover:text-red-300" title="Retirer le parrain">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-cream-dim">
                Depuis le {formatDateTime(data.sponsorSetAt)}
                {data.sponsorSetByName && <> · enregistré par {data.sponsorSetByName}</>}
              </div>
              {data.lockReason && <div className="mt-1 text-xs text-cream-muted">{data.lockReason}</div>}
            </div>
          ) : data.canSetSponsor ? (
            manage ? (
              <div>
                <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Enregistrer un parrain
                </Button>
                <p className="mt-2 text-xs text-cream-dim">
                  {data.afterPurchase
                    ? "Ce client a déjà acheté : le parrain sera enregistré sans générer de coupon de parrainage."
                    : `Le filleul reçoit un coupon de ${data.godchildPercent} % utilisable dès son premier achat ; le parrain reçoit ${data.sponsorPercent} % une fois ce premier achat enregistré.`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-cream-dim">Aucun parrain.</p>
            )
          ) : (
            <p className="text-sm text-cream-dim">
              Aucun parrain.
              {data.enabled && data.purchases > 0 && " Le parrainage n'est possible qu'avant le premier achat."}
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cream-muted">
            Filleuls
            <span className="font-normal normal-case tracking-normal text-cream-dim">
              {data.godchildren.length}
              {max != null ? ` / ${max}` : ""}
            </span>
          </div>
          {data.godchildren.length === 0 ? (
            <p className="text-sm text-cream-dim">Aucun filleul.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.godchildren.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link href={`/clients/${g.id}`} className="hover:underline">
                    {g.name}
                  </Link>
                  {g.sponsorRewarded ? (
                    <Badge color="#2F7D53">
                      <Check className="h-3 w-3" /> Coupon parrain reçu
                    </Badge>
                  ) : (
                    <Badge color="#7C8A99">
                      <Clock className="h-3 w-3" /> En attente du 1er achat
                    </Badge>
                  )}
                  <span className="text-xs text-cream-dim">depuis le {formatDateTime(g.since)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pickerOpen && (
        <SponsorPicker
          clientId={clientId}
          change={!!data.sponsor}
          afterPurchase={data.afterPurchase}
          onClose={() => setPickerOpen(false)}
          onSaved={async () => {
            setPickerOpen(false);
            await load();
            onChanged?.();
          }}
        />
      )}
    </Card>
  );
}

function SponsorPicker({
  clientId,
  change,
  afterPurchase,
  onClose,
  onSaved,
}: {
  clientId: string;
  change: boolean;
  afterPurchase: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Client[] | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<Client[]>(`/api/clients?q=${encodeURIComponent(q)}&limit=15`)
        .then((r) => setResults(r.filter((c) => c.id !== clientId)))
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, clientId]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/clients/${clientId}/sponsor`, { sponsorId: selected.id });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={change ? "Changer de parrain" : "Enregistrer un parrain"}>
      <div className="space-y-4">
        {change && (
          <p className="text-xs text-cream-dim">
            {afterPurchase
              ? "Le filleul a déjà acheté : son coupon reste tel quel, l'ancien parrain perd son coupon s'il ne l'a pas utilisé, et le nouveau parrain ne reçoit pas de coupon automatique."
              : "Le coupon actuel du filleul est annulé et un nouveau est créé au nom du nouveau parrain."}
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher le parrain : nom, prénom, téléphone…" className="pl-9" autoFocus />
        </div>
        {q.trim().length >= 2 && !results && <Spinner />}
        {results && (
          <ul className="max-h-64 overflow-y-auto rounded-md border border-night-500">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-cream-dim">Aucun client trouvé. Le parrain doit avoir une fiche client.</li>
            ) : (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-night-700",
                      selected?.id === c.id && "bg-paulie-green/25",
                    )}
                  >
                    {c.name}
                    {selected?.id === c.id && <Check className="ml-auto h-4 w-4 text-paulie-green-bright" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} disabled={!selected} loading={saving}>
            Enregistrer {selected ? `« ${selected.name} »` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
