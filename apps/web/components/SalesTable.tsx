"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { formatMoney, formatPhone, formatRelative } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { ImmediateBadge, StatusBadge } from "./StatusBadge";
import { Empty } from "./ui";

export function SalesTable({ sales, hideClient, empty = "Aucune vente." }: { sales: Sale[]; hideClient?: boolean; empty?: string }) {
  if (sales.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="table-bp min-w-[760px]">
        <thead>
          <tr>
            <th className="pl-5">Réf.</th>
            <th>Véhicule</th>
            {!hideClient && <th>Client</th>}
            <th>Statut</th>
            <th className="text-right">Prix</th>
            <th>Plaque</th>
            <th className="pr-5">Vendu</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td className="pl-5 font-mono text-xs">
                <Link href={`/ventes/${s.id}`} className="text-sand hover:underline">
                  {s.reference}
                </Link>
              </td>
              <td>
                <Link href={`/ventes/${s.id}`} className="font-medium hover:underline">
                  {s.vehicleName}
                </Link>
                <div className="flex items-center gap-1.5 text-xs text-cream-dim">
                  {s.vehicleTypeLabel} · {s.categoryLabel}
                  {s.permitWarning && (
                    <span title="Permis correspondant non renseigné" className="inline-flex items-center text-sand">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </td>
              {!hideClient && (
                <td>
                  <Link href={`/clients/${s.clientId}`} className="hover:underline">
                    {s.clientName}
                  </Link>
                  {s.clientPhone && <div className="text-xs text-cream-dim">{formatPhone(s.clientPhone)}</div>}
                </td>
              )}
              <td>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={s.status} />
                  {s.immediate && (s.status === "TO_ORDER" || s.status === "TO_FETCH") && <ImmediateBadge />}
                </div>
              </td>
              <td className="text-right tabular-nums">{formatMoney(s.price)}</td>
              <td className="font-mono text-xs">
                {s.plate ?? <span className="font-sans text-cream-dim">{s.requiresPlate ? "—" : "Sans plaque"}</span>}
              </td>
              <td className="pr-5 text-xs text-cream-muted">
                {formatRelative(s.createdAt)}
                <div className="text-cream-dim">{s.sellerName}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
