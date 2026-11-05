"use client";

import { useCallback, useEffect, useState } from "react";
import { CatalogEditor } from "@/components/config/CatalogEditor";
import { FieldsEditor } from "@/components/config/FieldsEditor";
import { GradesEditor } from "@/components/config/GradesEditor";
import { MembersList } from "@/components/config/MembersList";
import { PartnersEditor } from "@/components/config/PartnersEditor";
import { SettingsEditor } from "@/components/config/SettingsEditor";
import { VehiclesEditor } from "@/components/config/VehiclesEditor";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { AdminConfig } from "@/lib/types";

const TABS = [
  { key: "grades", label: "Grades & permissions" },
  { key: "client", label: "Fiche client" },
  { key: "sale", label: "Fiche vente" },
  { key: "vehicles", label: "Véhicules" },
  { key: "catalog", label: "Catalogue" },
  { key: "discord", label: "Discord, tournée & statuts" },
  { key: "advantages", label: "Avantages clients" },
  { key: "members", label: "Membres" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function ConfigurationPage() {
  const can = useCan();
  const [tab, setTab] = useState<Tab>("grades");
  const [admin, setAdmin] = useState<AdminConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAdmin = useCallback(async () => {
    try {
      setAdmin(await api.get<AdminConfig>("/api/admin/config"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, []);

  useEffect(() => {
    if (can(PERM.configManage)) void loadAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAdmin]);

  if (!can(PERM.configManage)) return <ErrorBox message="Ton grade ne donne pas accès à la configuration." />;

  return (
    <>
      <PageHeader title="Configuration" subtitle="Tout ce qui est réglé ici s'applique immédiatement à tous les employés." />
      <div className="mb-6 flex flex-wrap gap-2 border-b border-night-500/70 pb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-paulie-red text-cream" : "text-cream-muted hover:bg-night-700 hover:text-cream",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorBox message={error} />
      {admin?.discordError && (tab === "grades" || tab === "discord" || tab === "advantages") && (
        <div className="mb-4">
          <ErrorBox message={admin.discordError} />
        </div>
      )}

      {tab === "client" && <FieldsEditor entity="client" />}
      {tab === "sale" && <FieldsEditor entity="sale" />}
      {tab === "vehicles" && <VehiclesEditor />}
      {tab === "catalog" && <CatalogEditor />}
      {tab === "members" && <MembersList />}
      {(tab === "grades" || tab === "discord" || tab === "advantages") &&
        (!admin ? (
          <Spinner />
        ) : tab === "grades" ? (
          <GradesEditor admin={admin} onSaved={loadAdmin} />
        ) : tab === "advantages" ? (
          <div className="space-y-6">
            <SettingsEditor admin={admin} onSaved={loadAdmin} section="advantages" />
            <PartnersEditor admin={admin} />
          </div>
        ) : (
          <SettingsEditor admin={admin} onSaved={loadAdmin} section="discord" />
        ))}
    </>
  );
}
