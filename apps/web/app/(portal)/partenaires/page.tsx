"use client";

import { Ban, Eye, Handshake } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PERM, useCan, usePortal } from "@/lib/portal-context";
import type { PartnersOverview } from "@/lib/types";

/** Côté concession : nos partenaires, ce qu'ils offrent, et les customisations validées. */
export default function PartnersPage() {
  const can = useCan();
  const { config } = usePortal();
  const [data, setData] = useState<PartnersOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<PartnersOverview>("/api/partners"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string, label: string) {
    const reason = prompt(`Annuler la validation de « ${label} » ? Motif (facultatif) :`);
    if (reason === null) return;
    try {
      await api.post(`/api/partner/validations/${id}/cancel`, { reason });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annulation impossible.");
    }
  }

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  const categoryLabel = (ids: string[]) =>
    ids.length === 0 ? "tous les véhicules" : ids.map((id) => config.categories.find((c) => c.id === id)?.label ?? "?").join(", ");

  return (
    <>
      <PageHeader title="Partenaires" subtitle="Nos partenariats : avantages pour nos clients et pour nos employés." />
      <ErrorBox message={error} />
      {data.partners.length === 0 ? (
        <Empty>Aucun partenariat actif.</Empty>
      ) : (
        <div className="space-y-6">
          {data.partners.map((p) => (
            <Card
              key={p.id}
              title={
                <span className="flex items-center gap-2">
                  <Handshake className="h-5 w-5 text-sand" /> {p.name}
                </span>
              }
              actions={
                can(PERM.configManage) && (
                  <Link href={`/partenaire?partnerId=${p.id}`}>
                    <Button size="sm" variant="ghost">
                      <Eye className="h-4 w-4" /> Voir son espace
                    </Button>
                  </Link>
                )
              }
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sand">Pour nos clients</div>
                    <p className="whitespace-pre-line">
                      <strong>-{p.discountPercent} %</strong> sur la customisation, s'ils se présentent avec le véhicule dans les{" "}
                      <strong>{p.windowHours} h</strong> suivant la livraison ({categoryLabel(p.categoryIds)}).
                      {p.clientTerms && `\n${p.clientTerms}`}
                    </p>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sand">Pour nous, employés</div>
                    <p className="whitespace-pre-line">{p.contractTerms || "Conditions à définir."}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Customisations (30 j)" value={`${p.stats.count30}`} />
                  <Stat label="Montant (30 j)" value={formatMoney(p.stats.amount30)} />
                  <Stat label="Customisations (total)" value={`${p.stats.countAll}`} />
                  <Stat label="Montant (total)" value={formatMoney(p.stats.amountAll)} />
                </div>
              </div>
            </Card>
          ))}

          <Card title="Dernières customisations validées">
            {data.recent.length === 0 ? (
              <Empty>Aucune pour le moment.</Empty>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="table-bp min-w-[720px]">
                  <thead>
                    <tr>
                      <th className="pl-5">Validée le</th>
                      <th>Partenaire</th>
                      <th>Véhicule</th>
                      <th>Client</th>
                      <th className="text-right">Montant</th>
                      <th>Par</th>
                      <th className="pr-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((v) => (
                      <tr key={v.id}>
                        <td className="pl-5 text-xs">{formatDateTime(v.validatedAt)}</td>
                        <td>{v.partnerName}</td>
                        <td>
                          <Link href={`/ventes/${v.saleId}`} className="hover:underline">
                            {v.vehicleName}
                          </Link>
                          {v.plate && <span className="ml-2 font-mono text-xs text-cream-dim">{v.plate}</span>}
                          {v.note && <div className="text-xs text-cream-dim">{v.note}</div>}
                        </td>
                        <td>{v.clientName}</td>
                        <td className="text-right tabular-nums">{v.amount != null ? formatMoney(v.amount) : "—"}</td>
                        <td className="text-xs text-cream-muted">{v.validatedByName ?? "—"}</td>
                        <td className="pr-5 text-right">
                          {can(PERM.partnersCancel) && (
                            <button
                              onClick={() => cancel(v.id, v.vehicleName)}
                              className="rounded p-1 text-cream-dim hover:bg-paulie-red/20 hover:text-red-300"
                              title="Annuler la validation"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-night-500/70 bg-night-900/50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-cream-muted">{label}</div>
      <div className="mt-1 font-display text-2xl tabular-nums">{value}</div>
    </div>
  );
}
