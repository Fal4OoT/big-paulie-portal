"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

const ENTITY_LINK: Record<string, string> = { client: "/clients/", sale: "/ventes/" };

/** Retire le gras Markdown (**…**) destiné à Discord. */
const plain = (s: string) => s.replace(/\*\*/g, "");

export default function LogsPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<AuditEntry[]>(`/api/audit?q=${encodeURIComponent(q)}&limit=100`)
        .then((r) => {
          setRows(r);
          setMore(r.length === 100);
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function loadMore() {
    if (!rows?.length) return;
    setLoadingMore(true);
    try {
      const r = await api.get<AuditEntry[]>(`/api/audit?q=${encodeURIComponent(q)}&limit=100&before=${rows[rows.length - 1].id}`);
      setRows([...rows, ...r]);
      setMore(r.length === 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader title="Logs" subtitle="Toutes les actions du portail. Elles sont aussi envoyées dans le salon de logs Discord." />
      <Card>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : employé, client, véhicule, référence…" className="pl-9" />
        </div>
        <ErrorBox message={error} />
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty>Aucune entrée.</Empty>
        ) : (
          <>
            <ul className="divide-y divide-night-600/70">
              {rows.map((r) => {
                const href = r.entityId && ENTITY_LINK[r.entity] && !r.action.endsWith(".deleted") ? ENTITY_LINK[r.entity] + r.entityId : null;
                return (
                  <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
                    <div className="w-40 shrink-0 text-xs text-cream-muted">{formatDateTime(r.at)}</div>
                    <div className="w-40 shrink-0 text-sm font-semibold">{r.actorName}</div>
                    <div className="min-w-0 flex-1 whitespace-pre-line break-words text-sm">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {plain(r.summary)}
                        </Link>
                      ) : (
                        plain(r.summary)
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {more && (
              <div className="mt-4 text-center">
                <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                  Plus ancien
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
