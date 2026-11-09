"use client";

import { Ban, Gift, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { ClientCoupons as ClientCouponsData, Coupon, CouponStatus } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Input, Label, Modal, Spinner } from "./ui";

export const COUPON_STATUS: Record<CouponStatus, { label: string; color: string }> = {
  AVAILABLE: { label: "Disponible", color: "#2F7D53" },
  USED: { label: "Utilisé", color: "#7C8A99" },
  EXPIRED: { label: "Expiré", color: "#D9A441" },
  CANCELLED: { label: "Annulé", color: "#9E1B1E" },
};

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Créé",
  USED: "Utilisé",
  RELEASED: "Libéré",
  CANCELLED: "Annulé",
  RESTORED: "Rétabli",
};

/** Bloc « Coupons » de la fiche client : liste, attribution manuelle, annulation, progression de fidélité. */
export function ClientCoupons({ clientId, reloadKey }: { clientId: string; reloadKey?: number }) {
  const can = useCan();
  const [data, setData] = useState<ClientCouponsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<ClientCouponsData>(`/api/clients/${clientId}/coupons`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function cancel(c: Coupon) {
    const reason = prompt(`Annuler le coupon ${c.reference} (${c.percent} %) ? Motif (facultatif) :`);
    if (reason === null) return;
    try {
      await api.post(`/api/coupons/${c.id}/cancel`, { reason });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annulation impossible.");
    }
  }

  const available = data?.coupons.filter((c) => c.status === "AVAILABLE") ?? [];
  const others = data?.coupons.filter((c) => c.status !== "AVAILABLE") ?? [];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Coupons
          {available.length > 0 && <Badge color="#2F7D53">{available.length} disponible(s)</Badge>}
        </span>
      }
      actions={
        can(PERM.couponsCreate) && (
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Attribuer un coupon
          </Button>
        )
      }
    >
      <ErrorBox message={error} />
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {data.loyalty.enabled && <LoyaltyProgress loyalty={data.loyalty} />}

          {data.coupons.length === 0 ? (
            <Empty>Aucun coupon pour ce client.</Empty>
          ) : (
            <>
              {available.length > 0 ? (
                <ul className="space-y-2">
                  {available.map((c) => (
                    <CouponItem key={c.id} coupon={c} onCancel={can(PERM.couponsCancel) ? () => cancel(c) : undefined} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-cream-dim">Aucun coupon disponible.</p>
              )}
              {others.length > 0 && (
                <div>
                  <button onClick={() => setShowAll(!showAll)} className="text-xs text-cream-muted underline-offset-2 hover:text-cream hover:underline">
                    {showAll ? "Masquer l'historique" : `Voir les coupons utilisés, expirés ou annulés (${others.length})`}
                  </button>
                  {showAll && (
                    <ul className="mt-2 space-y-2">
                      {others.map((c) => (
                        <CouponItem key={c.id} coupon={c} onCancel={c.status === "EXPIRED" && can(PERM.couponsCancel) ? () => cancel(c) : undefined} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {createOpen && data && (
        <CreateCouponModal
          clientId={clientId}
          maxPercent={data.maxPercent}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await load();
          }}
        />
      )}
    </Card>
  );
}

function LoyaltyProgress({ loyalty }: { loyalty: ClientCouponsData["loyalty"] }) {
  const steps = Array.from({ length: loyalty.every }, (_, i) => i < loyalty.progress);
  return (
    <div className="rounded-lg border border-night-500/70 bg-night-900/50 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Gift className="h-4 w-4 text-sand" />
        <span>
          Fidélité : <strong>{loyalty.progress}</strong> / {loyalty.every} vers le prochain coupon de <strong>{loyalty.percent} %</strong>
        </span>
        <span className="ml-auto text-xs text-cream-dim">
          {loyalty.minAmount > 0
            ? `${loyalty.qualifying} achat(s) de ${formatMoney(loyalty.minAmount)} minimum · ${loyalty.purchases} au total`
            : `${loyalty.purchases} achat(s) au total`}
        </span>
      </div>
      {loyalty.every <= 20 && (
        <div className="flex gap-1" aria-hidden>
          {steps.map((done, i) => (
            <span key={i} className={cn("h-2 flex-1 rounded-full", done ? "bg-sand" : "bg-night-600")} />
          ))}
        </div>
      )}
    </div>
  );
}

function CouponItem({ coupon: c, onCancel }: { coupon: Coupon; onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  const st = COUPON_STATUS[c.status];
  return (
    <li className={cn("rounded-lg border px-4 py-3", c.status === "AVAILABLE" ? "border-paulie-green-bright/50 bg-paulie-green/10" : "border-night-500/70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Tag className="h-4 w-4 text-sand" />
        <span className="font-display text-xl">{c.percent} %</span>
        <span className="font-mono text-xs text-sand">{c.reference}</span>
        <Badge color={st.color}>{st.label}</Badge>
        {c.source === "LOYALTY" && <Badge color="#D9A441">Fidélité</Badge>}
        {c.source === "REFERRAL" && <Badge color="#E07A2F">Parrainage</Badge>}
        {c.source === "BIRTHDAY" && <Badge color="#B5568F">🎂 Anniversaire</Badge>}
        <span className="text-xs text-cream-muted">{c.expiresOn ? `Expire le ${formatDate(c.expiresOn)}` : "Sans expiration"}</span>
        {onCancel && (
          <button onClick={onCancel} className="ml-auto rounded p-1 text-cream-dim hover:bg-paulie-red/20 hover:text-red-300" title="Annuler le coupon">
            <Ban className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mt-1 text-sm">{c.reason}</p>
      <div className="mt-1 text-xs text-cream-dim">
        {c.source === "MANUAL" ? "Attribué" : "Généré"} le {formatDateTime(c.createdAt)}
        {c.createdByName && <> par {c.createdByName}</>}
        {c.sourceSaleReference && c.sourceSaleId && (
          <>
            {" "}
            (vente{" "}
            <Link href={`/ventes/${c.sourceSaleId}`} className="text-sand hover:underline">
              {c.sourceSaleReference}
            </Link>
            )
          </>
        )}
      </div>
      {c.status === "USED" && c.usedSaleId && (
        <div className="text-xs text-cream-muted">
          Utilisé le {formatDateTime(c.usedAt)} par {c.usedByName ?? "—"} sur{" "}
          <Link href={`/ventes/${c.usedSaleId}`} className="text-sand hover:underline">
            {c.usedSaleReference}
          </Link>
        </div>
      )}
      {c.status === "CANCELLED" && (
        <div className="text-xs text-cream-muted">
          Annulé le {formatDateTime(c.cancelledAt)}
          {c.cancelledByName && <> par {c.cancelledByName}</>}
          {c.cancelReason && <> · {c.cancelReason}</>}
        </div>
      )}
      {c.events.length > 1 && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-1 text-xs text-cream-dim underline-offset-2 hover:text-cream hover:underline">
            {open ? "Masquer l'historique" : "Historique"}
          </button>
          {open && (
            <ul className="mt-1 space-y-0.5 border-l border-night-500 pl-3 text-xs text-cream-muted">
              {c.events.map((e, i) => (
                <li key={i}>
                  {formatDateTime(e.at)} · {EVENT_LABEL[e.action] ?? e.action}
                  {e.saleReference && <> · {e.saleReference}</>}
                  {e.actorName && <> · {e.actorName}</>}
                  {e.note && <> · {e.note}</>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function CreateCouponModal({
  clientId,
  maxPercent,
  onClose,
  onCreated,
}: {
  clientId: string;
  maxPercent: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = Number(percent);
    if (!Number.isInteger(p) || p < 1 || p > maxPercent) return setError(`La promotion doit être un nombre entier entre 1 et ${maxPercent} %.`);
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/clients/${clientId}/coupons`, { percent: p, reason, expiresOn: expiresOn || null });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Attribuer un coupon">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="cp-percent" required>
            Promotion (%)
          </Label>
          <div className="flex items-center gap-2">
            <Input id="cp-percent" type="number" min={1} max={maxPercent} step={1} value={percent} onChange={(e) => setPercent(e.target.value)} className="w-28" required autoFocus />
            <span className="text-sm text-cream-muted">maximum {maxPercent} %</span>
          </div>
        </div>
        <div>
          <Label htmlFor="cp-reason" required>
            Raison
          </Label>
          <Input id="cp-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required placeholder="ex : geste commercial suite au retard de livraison" />
        </div>
        <div>
          <Label htmlFor="cp-exp">Date d'expiration (facultative)</Label>
          <Input id="cp-exp" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="w-48" />
          <p className="mt-1 text-xs text-cream-dim">Valable jusqu'à ce jour inclus. Vide : sans expiration.</p>
        </div>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={saving}>
            Attribuer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
