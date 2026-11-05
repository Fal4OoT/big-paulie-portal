"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Ban, Check, Gift, Pencil, RotateCcw, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FieldDisplay } from "@/components/DynamicFields";
import { SaleFormModal } from "@/components/SaleForm";
import { ImmediateBadge, StatusBadge } from "@/components/StatusBadge";
import { Badge, Button, Card, ErrorBox, Input, Label, Modal, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { giftFor, PERM, useCan, usePortal, useStatus } from "@/lib/portal-context";
import { STATUS_FLOW, type Client, type Sale, type SaleEvent, type SalePartnerValidation, type StatusCode } from "@/lib/types";

export default function SalePage() {
  const { id } = useParams<{ id: string }>();
  const { config } = usePortal();
  const can = useCan();
  const status = useStatus();
  const [sale, setSale] = useState<Sale | null>(null);
  const [events, setEvents] = useState<SaleEvent[]>([]);
  const [partnerValidations, setPartnerValidations] = useState<SalePartnerValidation[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [giftChoice, setGiftChoice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ sale: Sale; events: SaleEvent[]; partnerValidations: SalePartnerValidation[] }>(`/api/sales/${id}`);
      setSale(res.sale);
      setEvents(res.events);
      setPartnerValidations(res.partnerValidations ?? []);
      setPlate(res.sale.plate ?? "");
      if (can(PERM.clientsView)) setClient(await api.get<Client>(`/api/clients/${res.sale.clientId}`).catch(() => null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(to: StatusCode, extra?: { plate?: string; note?: string; giftChoice?: string | null }) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/sales/${id}/status`, { to, ...extra });
      setDeliverOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !sale) return <ErrorBox message={error} />;
  if (!sale) return <Spinner />;

  const cancelled = sale.status === "CANCELLED";
  const rank = STATUS_FLOW.indexOf(sale.status);
  const next = !cancelled && rank < STATUS_FLOW.length - 1 ? STATUS_FLOW[rank + 1] : null;
  const prev = !cancelled && rank > 0 ? STATUS_FLOW[rank - 1] : null;
  const type = config.vehicleTypes.find((t) => t.id === sale.vehicleTypeId);
  const gift = sale.status === "DELIVERED" ? null : giftFor(config, sale.price);
  // Partenariats qui concernent ce véhicule (catégorie éligible).
  const partners = config.partners.filter((p) => p.categoryIds.length === 0 || p.categoryIds.includes(sale.categoryId));
  const deliveredMs = sale.deliveredAt ? new Date(sale.deliveredAt).getTime() : null;
  const permitField = type?.permitFieldKey ? config.clientFields.find((f) => f.key === type.permitFieldKey) : undefined;

  function advance() {
    if (!next) return;
    // La fenêtre de livraison s'ouvre s'il faut une plaque ou s'il y a un cadeau à remettre.
    if (next === "DELIVERED" && (sale!.requiresPlate || gift || partners.length > 0)) {
      setGiftChoice(null);
      setDeliverOpen(true);
    }
    else void changeStatus(next);
  }

  function cancelSale() {
    const reason = prompt("Motif de l'annulation (facultatif) :");
    if (reason === null) return;
    void changeStatus("CANCELLED", { note: reason });
  }

  return (
    <>
      <Link href="/ventes" className="mb-4 inline-flex items-center gap-1 text-sm text-cream-muted hover:text-cream">
        <ArrowLeft className="h-4 w-4" /> Ventes
      </Link>
      <PageHeader
        title={sale.vehicleName}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-sand">{sale.reference}</span>· {sale.vehicleTypeLabel} · {sale.categoryLabel}
            <StatusBadge status={sale.status} />
            {sale.immediate && <ImmediateBadge />}
            {!sale.catalogVehicleId && <Badge color="#7C8A99">Hors catalogue</Badge>}
          </span>
        }
        actions={
          can(PERM.salesEdit) && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Modifier
            </Button>
          )
        }
      />

      {/* Circuit logistique */}
      <Card className="mb-6">
        <ol className="grid gap-2 sm:grid-cols-4">
          {STATUS_FLOW.map((code, i) => {
            const s = status(code);
            const done = !cancelled && i < rank;
            const current = !cancelled && i === rank;
            const ev = [...events].reverse().find((e) => e.toStatus === code);
            return (
              <li
                key={code}
                className={cn(
                  "rounded-lg border px-4 py-3",
                  current ? "border-transparent" : "border-night-500/70",
                  !done && !current && "opacity-50",
                )}
                style={current ? { backgroundColor: `${s.color}26`, boxShadow: `inset 0 0 0 1px ${s.color}` } : undefined}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {done ? <Check className="h-4 w-4 text-paulie-green-bright" /> : <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />}
                  {s.label}
                </div>
                {(done || current) && ev && (
                  <div className="mt-1 text-xs text-cream-muted">
                    {ev.actorName ?? "—"} · {formatDateTime(ev.at)}
                  </div>
                )}
                {done && !ev && sale.fromStock && <div className="mt-1 text-xs text-cream-dim">Non nécessaire (en stock)</div>}
              </li>
            );
          })}
        </ol>

        <ErrorBox message={error} />

        <div className="mt-4 flex flex-wrap gap-2">
          {cancelled ? (
            can(PERM.salesCancel) && (
              <Button variant="secondary" loading={busy} onClick={() => changeStatus("TO_ORDER", { note: "Vente rétablie" })}>
                <RotateCcw className="h-4 w-4" /> Rétablir la vente
              </Button>
            )
          ) : (
            <>
              {next && can(PERM.salesAdvance) && (
                <Button variant="green" loading={busy} onClick={advance}>
                  Passer en « {status(next).label} » <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {prev && can(PERM.salesRevert) && (
                <Button variant="ghost" loading={busy} onClick={() => changeStatus(prev)}>
                  <Undo2 className="h-4 w-4" /> Revenir à « {status(prev).label} »
                </Button>
              )}
              {sale.status !== "DELIVERED" && can(PERM.salesCancel) && (
                <Button variant="danger" loading={busy} onClick={cancelSale}>
                  <Ban className="h-4 w-4" /> Annuler la vente
                </Button>
              )}
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Détails" className="lg:col-span-3">
          {sale.permitWarning && (
            <div className="mb-4 flex items-start gap-3 rounded-md border border-sand/50 bg-sand/10 px-4 py-3 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sand" />
              <span>
                Le client n'a pas de « {permitField?.label ?? "permis"} » renseigné sur sa fiche.
              </span>
            </div>
          )}
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Info label="Client">
              <Link href={`/clients/${sale.clientId}`} className="text-sand hover:underline">
                {sale.clientName}
              </Link>
              {sale.clientPhone && <div className="text-sm text-cream-muted">{formatPhone(sale.clientPhone)}</div>}
            </Info>
            <Info label="Prix de vente">{formatMoney(sale.price)}</Info>
            <Info label="Type">
              {sale.vehicleTypeLabel} · {sale.categoryLabel}
            </Info>
            <Info label="Provenance">
              {sale.fromStock ? "En stock à la concession" : sale.immediate ? "Immédiate (on part le chercher)" : "Prochaine tournée"}
            </Info>
            <Info label="Plaque">
              {!sale.requiresPlate ? (
                <span className="text-cream-dim">Sans plaque ({sale.categoryLabel.toLowerCase()})</span>
              ) : sale.plate ? (
                <span className="font-mono">{sale.plate}</span>
              ) : (
                <span className="text-cream-dim">À renseigner à la livraison</span>
              )}
            </Info>
            <Info label="Vendeur">{sale.sellerName}</Info>
            <Info label="Cadeau">
              {sale.gift ? (
                <span>🎁 {sale.gift}</span>
              ) : gift ? (
                <span className="text-amber-100">🎁 Prévu à la livraison : {gift.label}{gift.choices.length > 0 ? ` (${gift.choices.join(" / ")})` : ""}</span>
              ) : (
                <span className="text-cream-dim">Aucun</span>
              )}
            </Info>
            {partners.length > 0 && (
              <Info label="Partenariat" wide>
                <ul className="space-y-1">
                  {partners.map((p) => {
                    const v = partnerValidations.find((x) => x.partnerName === p.name);
                    const until = deliveredMs ? deliveredMs + p.windowHours * 3_600_000 : null;
                    return (
                      <li key={p.id}>
                        🔧 <strong>{p.name}</strong> · -{p.discountPercent} %{" "}
                        {v ? (
                          <span className="text-green-300">
                            · customisation validée le {formatDateTime(v.validatedAt)}
                            {v.validatedByName && <> par {v.validatedByName}</>}
                            {v.amount != null && <> · {formatMoney(v.amount)}</>}
                          </span>
                        ) : until ? (
                          <span className={until > Date.now() ? "text-amber-100" : "text-cream-dim"}>
                            · {until > Date.now() ? `valable jusqu'au ${formatDateTime(new Date(until).toISOString())}` : "délai dépassé"}
                          </span>
                        ) : (
                          <span className="text-cream-dim">· valable {p.windowHours} h après la livraison</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Info>
            )}
            <Info label="Coupon">
              {sale.couponId ? (
                <span>
                  <strong>{sale.couponPercent} %</strong> <span className="font-mono text-xs text-sand">{sale.couponReference}</span>
                  {sale.couponReason && <div className="text-sm text-cream-muted">{sale.couponReason}</div>}
                </span>
              ) : (
                <span className="text-cream-dim">Aucun</span>
              )}
            </Info>
            <Info label="Date de vente">{formatDateTime(sale.createdAt)}</Info>
            <Info label="Livrée le">{formatDateTime(sale.deliveredAt)}</Info>
            {config.saleFields.map((f) => (
              <Info key={f.key} label={f.label} wide={f.type === "textarea"}>
                <FieldDisplay field={f} value={sale.data[f.key]} />
              </Info>
            ))}
          </dl>
        </Card>

        <Card title="Historique" className="lg:col-span-2">
          <ol className="relative space-y-4 border-l border-night-500 pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-night-800 bg-sand" />
                <div className="text-sm">
                  <EventText event={e} />
                </div>
                <div className="text-xs text-cream-muted">
                  {e.actorName ?? "Système"} · {formatDateTime(e.at)}
                </div>
                {e.note && <div className="mt-1 text-xs italic text-cream-dim">{e.note}</div>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {editOpen && (
        <SaleFormModal
          open
          sale={sale}
          clientId={sale.clientId}
          clientData={client?.data ?? {}}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await load();
          }}
        />
      )}

      <Modal open={deliverOpen} onClose={() => setDeliverOpen(false)} title="Livraison au client">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (gift && gift.choices.length > 0 && !giftChoice) {
              setError(`Choisis le cadeau : ${gift.choices.join(" ou ")}.`);
              return;
            }
            void changeStatus("DELIVERED", { plate: sale.requiresPlate ? plate : undefined, giftChoice });
          }}
          className="space-y-4"
        >
          <p className="text-sm text-cream-muted">
            Remise du véhicule à <strong className="text-cream">{sale.clientName}</strong>.
          </p>
          {sale.requiresPlate && (
            <div>
              <Label htmlFor="plate" required>
                Plaque
              </Label>
              <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} maxLength={16} required autoFocus className="font-mono text-lg tracking-widest" />
            </div>
          )}
          {partners.length > 0 && (
            <div className="rounded-lg border border-paulie-green-bright/50 bg-paulie-green/15 px-4 py-3 text-sm">
              {partners.map((p) => (
                <div key={p.id}>
                  🔧 <strong>À dire au client :</strong> -{p.discountPercent} % sur sa customisation chez <strong>{p.name}</strong> s'il s'y présente avec le
                  véhicule dans les {p.windowHours} h.
                </div>
              ))}
            </div>
          )}
          {gift && (
            <div className="rounded-lg border border-sand/60 bg-sand/10 px-4 py-3">
              <div className="flex items-center gap-2 font-semibold text-amber-100">
                <Gift className="h-5 w-5 text-sand" /> Cadeau à remettre : {gift.label}
              </div>
              {gift.choices.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {gift.choices.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setGiftChoice(ch)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm transition-colors",
                        giftChoice === ch ? "border-sand bg-sand/25 text-cream" : "border-night-500 text-cream-muted hover:text-cream",
                      )}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <ErrorBox message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeliverOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="green" loading={busy}>
              <Check className="h-4 w-4" /> Confirmer la livraison
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Info({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <dt className="text-xs font-semibold uppercase tracking-wider text-cream-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function EventText({ event: e }: { event: SaleEvent }) {
  const status = useStatus();
  switch (e.action) {
    case "CREATED":
      return <>Vente enregistrée</>;
    case "EDITED":
      return <>Vente modifiée</>;
    case "CANCELLED":
      return <span className="text-red-300">Vente annulée</span>;
    case "RESTORED":
      return <>Vente rétablie</>;
    default:
      return (
        <>
          {e.fromStatus ? status(e.fromStatus).label : "—"} → <strong>{e.toStatus ? status(e.toStatus).label : "—"}</strong>
        </>
      );
  }
}
