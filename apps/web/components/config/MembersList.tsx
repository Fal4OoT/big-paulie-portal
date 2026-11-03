"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { Member } from "@/lib/types";
import { Badge, Card, Empty, ErrorBox, Spinner } from "../ui";

export function MembersList() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Member[]>("/api/admin/members").then(setMembers).catch((e) => setError(e.message));
  }, []);

  return (
    <Card title="Membres connectés au portail">
      <p className="mb-4 text-sm text-cream-muted">
        Les grades viennent des rôles Discord (resynchronisés toutes les 5 minutes). Pour changer le grade de quelqu'un, change son rôle sur Discord.
      </p>
      <ErrorBox message={error} />
      {!members ? (
        <Spinner />
      ) : members.length === 0 ? (
        <Empty>Personne ne s'est encore connecté.</Empty>
      ) : (
        <ul className="divide-y divide-night-600/70">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              {m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-night-600 font-display">{m.displayName[0]}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{m.displayName}</div>
                <div className="text-xs text-cream-dim">@{m.username}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.isAdmin && <Badge color="#9E1B1E">Administrateur</Badge>}
                {m.grades.map((g) => (
                  <Badge key={g} color="#2F7D53">
                    {g}
                  </Badge>
                ))}
                {!m.isAdmin && m.grades.length === 0 && <span className="text-xs text-cream-dim">Aucun grade</span>}
              </div>
              <div className="w-32 text-right text-xs text-cream-muted">{formatRelative(m.lastLoginAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
