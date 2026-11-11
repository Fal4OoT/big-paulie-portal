"use client";

import { CheckCircle2, Clock, FileText, Pencil, Search, Users, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomizationModal, CustomizationSummary, type CustomizationTarget } from "@/components/Customization";
import { normalize } from "@/components/VehicleSearch";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatMoney } from "@/lib/format";
import type { PartnerEligible, PartnerSpace, PartnerValidation } from "@/lib/types";

type Tab = "vehicles" | "history" | "employees" | "contract";

/** Espace des employés d'un partenaire : véhicules éligibles, validation, nos employés, contrat. */
export default function PartnerSpacePage() {
  const [data, setData] = useState<PartnerSpace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("vehicles");
  const [q, setQ] = useState("");
  const [validating, setValidating] = useState<CustomizationTarget | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const id = new URLSearchParams(window.location.search).get("partnerId");
      setData(await api.get<PartnerSpace>(`/api/partner/space${id ? `?partnerId=${id}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  const filter = useCallback(
    <T extends { vehicleName: string; plate: string | null; clientName: string }>(list: T[]) => {
      const terms = normalize(q).split(" ").filter(Boolean);
      if (terms.length === 0) return list;
      return list.filter((v) => {
        const hay = normalize(`${v.vehicleName} ${v.plate ?? ""} ${v.clientName}`);
        return terms.every((t) => hay.includes(t));
      });
    },
    [q],
  );

  const eligible = useMemo(() => filter(data?.eligible ?? []), [data, filter]);
  const history = useMemo(() => filter(data?.history ?? []), [data, filter]);

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;
  const p = data.partner;

  const tabs: { key: Tab; label: string; icon: typeof Wrench; count?: number }[] = [
    { key: "vehicles", label: "Véhicules éligibles", icon: Wrench, count: data.eligible.filter((v) => !v.validationId).length },
    { key: "history", label: "Historique", icon: CheckCircle2 },
    { key: "employees", label: "Employés Big Paulie", icon: Users },
    { key: "contract", label: "Contrat", icon: FileText },
  ];

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={
          <>
            Partenariat Big Paulie : <strong className="text-cream">-{p.discountPercent} %</strong> sur la customisation d'un véhicule acheté chez nous,
            dans les <strong className="text-cream">{p.windowHours} h</strong> suivant sa livraison.
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 border-b border-night-500/70 pb-3">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === key ? "bg-paulie-red text-cream" : "text-cream-muted hover:bg-night-700 hover:text-cream",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
            {count ? <span className="rounded-full bg-night-900/60 px-1.5 text-xs">{count}</span> : null}
          </button>
        ))}
      </div>

      {(tab === "vehicles" || tab === "history") && (
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plaque, véhicule ou client…" className="pl-9" />
        </div>
      )}

      {tab === "vehicles" && (
        <Card>
          {eligible.length === 0 ? (
            <Empty>Aucun véhicule éligible en ce moment.</Empty>
          ) : (
            <ul className="divide-y divide-night-600/70">
              {eligible.map((v) => {
                const left = new Date(v.expiresAt).getTime() - now;
                const h = Math.max(0, Math.floor(left / 3_600_000));
                const m = Math.max(0, Math.floor((left % 3_600_000) / 60_000));
                return (
                  <li key={v.saleId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{v.vehicleName}</span>
                        <span className="text-xs text-cream-dim">{v.vehicleTypeLabel}</span>
                        {v.plate && <span className="rounded border border-night-500 bg-night-900 px-2 py-0.5 font-mono text-sm tracking-widest">{v.plate}</span>}
                      </div>
                      <div className="text-sm text-cream-muted">
                        Client : <span className="text-cream">{v.clientName}</span> · livré le {formatDateTime(v.deliveredAt)}
                      </div>
                    </div>
                    {v.validationId ? (
                      <div className="text-right text-sm">
                        <Badge color="#2F7D53">
                          <CheckCircle2 className="h-3 w-3" /> Validée
                        </Badge>
                        <div className="mt-1 text-xs text-cream-dim">
                          {v.validatedByName ?? "—"} · {formatDateTime(v.validatedAt)}
                          {v.amount != null && <> · {formatMoney(v.amount)}</>}
                        </div>
                        <CustomizationSummary value={v} className="mt-1" />
                        {data.canValidate && (
                          <button onClick={() => setValidating(editTarget(v, v.validationId!))} className="mt-1 inline-flex items-center gap-1 text-xs text-sand hover:underline">
                            <Pencil className="h-3 w-3" /> Modifier
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <span className={cn("inline-flex items-center gap-1 text-sm", h < 2 ? "text-sunset" : "text-cream-muted")}>
                          <Clock className="h-4 w-4" /> encore {h} h {String(m).padStart(2, "0")}
                        </span>
                        {data.canValidate && (
                          <Button
                            size="sm"
                            variant="green"
                            onClick={() => setValidating({ saleId: v.saleId, vehicleName: v.vehicleName, plate: v.plate, clientName: v.clientName })}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Customisation effectuée
                          </Button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === "history" && (
        <Card>
          {history.length === 0 ? (
            <Empty>Aucune customisation validée.</Empty>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="table-bp min-w-[640px]">
                <thead>
                  <tr>
                    <th className="pl-5">Validée le</th>
                    <th>Véhicule</th>
                    <th>Client</th>
                    <th className="text-right">Montant</th>
                    <th className={data.canValidate ? "" : "pr-5"}>Par</th>
                    {data.canValidate && <th className="pr-5" />}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="pl-5 text-xs">{formatDateTime(h.validatedAt)}</td>
                      <td>
                        {h.vehicleName}
                        {h.plate && <span className="ml-2 font-mono text-xs text-cream-dim">{h.plate}</span>}
                        <CustomizationSummary value={h} />
                        {h.note && <div className="text-xs text-cream-dim">{h.note}</div>}
                      </td>
                      <td>{h.clientName}</td>
                      <td className="text-right tabular-nums">{h.amount != null ? formatMoney(h.amount) : "—"}</td>
                      <td className={cn("text-xs text-cream-muted", !data.canValidate && "pr-5")}>
                        {h.validatedByName ?? "—"}
                        {h.updatedAt && (
                          <div className="text-cream-dim">
                            modifiée le {formatDateTime(h.updatedAt)}
                            {h.updatedByName && ` par ${h.updatedByName}`}
                          </div>
                        )}
                      </td>
                      {data.canValidate && (
                        <td className="pr-5 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setValidating(editTarget(h, h.id))} title="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "employees" && (
        <Card title="Employés du Big Paulie">
          <p className="mb-4 text-sm text-cream-muted">Ces personnes bénéficient des conditions de notre contrat (onglet « Contrat »).</p>
          {data.employees.length === 0 ? (
            <Empty>Aucun employé.</Empty>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.employees.map((e, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg border border-night-500/70 bg-night-900/50 px-3 py-2">
                  {e.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-night-600 font-display">{e.name[0]}</div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.name}</div>
                    {e.grade && <div className="text-xs text-cream-dim">{e.grade}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "contract" && (
        <Card title="Contrat de partenariat">
          <div className="space-y-5 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sand">Pour les clients du Big Paulie</div>
              <p className="whitespace-pre-line">
                -{p.discountPercent} % sur la customisation d'un véhicule acheté au Big Paulie, sur présentation du véhicule dans les {p.windowHours} h
                suivant sa livraison.
                {p.clientTerms && `\n${p.clientTerms}`}
              </p>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sand">Pour les employés du Big Paulie</div>
              <p className="whitespace-pre-line">{p.contractTerms || "Conditions à définir."}</p>
            </div>
          </div>
        </Card>
      )}

      {validating && (
        <CustomizationModal
          target={validating}
          discount={p.discountPercent}
          onClose={() => setValidating(null)}
          onDone={async () => {
            setValidating(null);
            await load();
          }}
        />
      )}
    </>
  );
}

/** Cible de modification d'une customisation déjà validée. */
function editTarget(v: PartnerEligible | PartnerValidation, validationId: string): CustomizationTarget {
  return {
    validationId,
    vehicleName: v.vehicleName,
    plate: v.plate,
    clientName: v.clientName,
    initial: {
      amount: v.amount,
      note: v.note,
      cosmetic: v.cosmetic,
      cosmeticAmount: v.cosmeticAmount,
      performance: v.performance,
      performanceAmount: v.performanceAmount,
      engine: v.engine,
      turbo: v.turbo,
      transmission: v.transmission,
      suspension: v.suspension,
      brakes: v.brakes,
    },
  };
}
