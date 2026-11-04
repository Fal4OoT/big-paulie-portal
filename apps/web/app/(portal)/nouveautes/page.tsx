"use client";

import { Sparkles, Wrench, Zap } from "lucide-react";
import { useEffect } from "react";
import { Card, PageHeader } from "@/components/ui";
import { CHANGELOG, CURRENT_VERSION, SEEN_VERSION_KEY, type ChangeKind } from "@/lib/changelog";
import { formatDate } from "@/lib/format";

const KIND: Record<ChangeKind, { label: string; color: string; icon: typeof Sparkles }> = {
  nouveau: { label: "Nouveau", color: "#2F7D53", icon: Sparkles },
  amélioration: { label: "Amélioration", color: "#D9A441", icon: Zap },
  correction: { label: "Correction", color: "#C8312F", icon: Wrench },
};

export default function ChangelogPage() {
  // Marque la version actuelle comme vue (retire le point « nouveau » du menu).
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_VERSION_KEY, CURRENT_VERSION);
      window.dispatchEvent(new Event("bp:seen-version"));
    } catch {
      /* stockage indisponible : sans importance */
    }
  }, []);

  return (
    <>
      <PageHeader title="Nouveautés" subtitle={`Version actuelle : v${CURRENT_VERSION}`} />
      <div className="space-y-6">
        {CHANGELOG.map((r, i) => (
          <Card
            key={r.version}
            title={
              <span className="flex flex-wrap items-baseline gap-3">
                <span className="text-sand">v{r.version}</span>
                <span>{r.title}</span>
              </span>
            }
            actions={
              <span className="flex items-center gap-2 text-xs text-cream-muted">
                {i === 0 && <span className="rounded-full bg-paulie-red px-2 py-0.5 font-semibold text-cream">Actuelle</span>}
                {formatDate(r.date)}
              </span>
            }
          >
            <ul className="space-y-2.5">
              {r.changes.map((c, j) => {
                const k = KIND[c.kind];
                const Icon = k.icon;
                return (
                  <li key={j} className="flex items-start gap-3 text-sm">
                    <span
                      className="mt-0.5 inline-flex w-32 shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: k.color }}
                    >
                      <Icon className="h-3.5 w-3.5" /> {k.label}
                    </span>
                    <span>{c.text}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
