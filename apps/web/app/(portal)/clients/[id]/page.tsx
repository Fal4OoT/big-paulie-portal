"use client";

import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientCoupons } from "@/components/ClientCoupons";
import { ClientForm } from "@/components/ClientForm";
import { ClientReferral } from "@/components/ClientReferral";
import { FieldDisplay } from "@/components/DynamicFields";
import { ImagePaste } from "@/components/ImagePaste";
import { SaleFormModal } from "@/components/SaleForm";
import { SalesTable } from "@/components/SalesTable";
import { Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { PERM, useCan, usePortal } from "@/lib/portal-context";
import type { Client, Sale } from "@/lib/types";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { config } = usePortal();
  const can = useCan();
  const [client, setClient] = useState<Client | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [couponsKey, setCouponsKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        api.get<Client>(`/api/clients/${id}`),
        can(PERM.salesView) ? api.get<Sale[]>(`/api/sales?clientId=${id}`) : Promise.resolve([] as Sale[]),
      ]);
      setClient(c);
      setSales(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    if (!client || !confirm(`Supprimer définitivement le client ${client.name} ?`)) return;
    setDeleting(true);
    try {
      await api.del(`/api/clients/${client.id}`);
      router.push("/clients");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
      setDeleting(false);
    }
  }

  if (error && !client) return <ErrorBox message={error} />;
  if (!client) return <Spinner />;

  const textFields = config.clientFields.filter((f) => f.type !== "image");
  const imageFields = config.clientFields.filter((f) => f.type === "image");

  return (
    <>
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1 text-sm text-cream-muted hover:text-cream">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>
      <PageHeader
        title={client.name}
        subtitle={
          <>
            Créé le {formatDateTime(client.createdAt)}
            {client.createdByName && <> par {client.createdByName}</>}
            {client.updatedAt !== client.createdAt && client.updatedByName && (
              <> · modifié le {formatDateTime(client.updatedAt)} par {client.updatedByName}</>
            )}
          </>
        }
        actions={
          !editing && (
            <>
              {can(PERM.salesCreate) && (
                <Button onClick={() => setSaleOpen(true)}>
                  <Plus className="h-4 w-4" /> Nouvel achat
                </Button>
              )}
              {can(PERM.clientsEdit) && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Modifier
                </Button>
              )}
              {can(PERM.clientsDelete) && (
                <Button variant="danger" onClick={remove} loading={deleting}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )
        }
      />
      <ErrorBox message={error} />

      {editing ? (
        <Card title="Modifier la fiche">
          <ClientForm
            clientId={client.id}
            initial={client.data}
            onSaved={async () => {
              setEditing(false);
              await load();
            }}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card title="Fiche client">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {textFields.map((f) => (
                <div key={f.key}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-cream-muted">{f.label}</dt>
                  <dd className="mt-1">
                    <FieldDisplay field={f} value={client.data[f.key]} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {imageFields.length > 0 && (
            <Card title="Permis et documents">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {imageFields.map((f) => (
                  <div key={f.key}>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-cream-muted">{f.label}</div>
                    <ImagePaste value={typeof client.data[f.key] === "string" ? (client.data[f.key] as string) : null} onChange={() => undefined} disabled />
                  </div>
                ))}
              </div>
            </Card>
          )}

          <ClientReferral clientId={client.id} onChanged={() => setCouponsKey((k) => k + 1)} />

          <ClientCoupons clientId={client.id} reloadKey={couponsKey} />

          {can(PERM.salesView) && (
            <Card title={`Achats (${sales.length})`}>
              <SalesTable sales={sales} hideClient empty="Aucun achat pour ce client." />
            </Card>
          )}
        </div>
      )}

      {saleOpen && (
        <SaleFormModal
          open
          onClose={() => setSaleOpen(false)}
          onSaved={(saleId) => router.push(`/ventes/${saleId}`)}
          clientId={client.id}
          clientData={client.data}
        />
      )}
    </>
  );
}
