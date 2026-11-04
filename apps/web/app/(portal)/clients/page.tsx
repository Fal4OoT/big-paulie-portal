"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { ageFrom, formatDate, formatPhone, formatRelative } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  const can = useCan();
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<Client[]>(`/api/clients?q=${encodeURIComponent(q)}`)
        .then(setClients)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Comptes clients de la concession."
        actions={
          can(PERM.clientsCreate) && (
            <Link href="/clients/nouveau">
              <Button>
                <Plus className="h-4 w-4" /> Nouveau client
              </Button>
            </Link>
          )
        }
      />
      <Card>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, prénom, téléphone…" className="pl-9" autoFocus />
        </div>
        <ErrorBox message={error} />
        {!clients ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <Empty>{q ? "Aucun client ne correspond." : "Aucun client pour le moment."}</Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="table-bp min-w-[640px]">
              <thead>
                <tr>
                  <th className="pl-5">Client</th>
                  <th>Téléphone</th>
                  <th>Naissance</th>
                  <th>Ventes</th>
                  <th className="pr-5">Mis à jour</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const dob = typeof c.data.date_naissance === "string" ? c.data.date_naissance : null;
                  const age = ageFrom(dob);
                  return (
                    <tr key={c.id}>
                      <td className="pl-5">
                        <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="tabular-nums">{c.data.telephone ? formatPhone(String(c.data.telephone)) : <span className="text-cream-dim">—</span>}</td>
                      <td>
                        {formatDate(dob)}
                        {age !== null && <span className="text-cream-dim"> · {age} ans</span>}
                      </td>
                      <td>
                        {c.saleCount}
                        {c.activeSaleCount > 0 && <span className="ml-2 text-xs text-sand">{c.activeSaleCount} en cours</span>}
                      </td>
                      <td className="pr-5 text-xs text-cream-muted">{formatRelative(c.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
