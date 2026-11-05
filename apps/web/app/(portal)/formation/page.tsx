"use client";

import { BookOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner } from "@/components/ui";
import { normalize } from "@/components/VehicleSearch";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { TrainingSummary } from "@/lib/types";

export default function TrainingListPage() {
  const can = useCan();
  const [sheets, setSheets] = useState<TrainingSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TrainingSummary[]>("/api/training").then(setSheets).catch((e) => setError(e.message));
  }, []);

  const groups = useMemo(() => {
    if (!sheets) return [];
    const terms = normalize(q).split(" ").filter(Boolean);
    const filtered = sheets.filter((s) => {
      if (terms.length === 0) return true;
      const hay = normalize(`${s.title} ${s.category ?? ""} ${s.searchText}`);
      return terms.every((t) => hay.includes(t));
    });
    const map = new Map<string, TrainingSummary[]>();
    for (const s of filtered) {
      const k = s.category ?? "Général";
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()];
  }, [sheets, q]);

  return (
    <>
      <PageHeader
        title="Formation"
        subtitle="Le métier au Big Paulie : procédures, conseils et astuces."
        actions={
          can(PERM.trainingManage) && (
            <Link href="/formation/nouveau">
              <Button>
                <Plus className="h-4 w-4" /> Nouvelle fiche
              </Button>
            </Link>
          )
        }
      />
      <ErrorBox message={error} />
      {!sheets ? (
        <Spinner />
      ) : sheets.length === 0 ? (
        <Empty>Aucune fiche de formation pour le moment.</Empty>
      ) : (
        <>
          <div className="relative mb-6 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-dim" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans les fiches…" className="pl-9" />
          </div>
          {groups.length === 0 ? (
            <Empty>Aucune fiche ne correspond.</Empty>
          ) : (
            <div className="space-y-8">
              {groups.map(([category, list]) => (
                <section key={category}>
                  <h2 className="mb-3 font-display text-lg uppercase tracking-wide text-sand">{category}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((s) => (
                      <Link key={s.id} href={`/formation/${s.id}`} className="group">
                        <Card className="h-full transition-colors group-hover:border-cream-dim">
                          <div className="flex items-start gap-3">
                            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-sand" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{s.title}</span>
                                {!s.published && <Badge color="#7C8A99">Brouillon</Badge>}
                              </div>
                              {s.excerpt && <p className="mt-1 line-clamp-3 text-sm text-cream-muted">{s.excerpt}</p>}
                              <p className="mt-2 text-xs text-cream-dim">
                                Mis à jour {formatRelative(s.updatedAt)}
                                {s.updatedByName && <> par {s.updatedByName}</>}
                              </p>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
