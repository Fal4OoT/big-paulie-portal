"use client";

import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { TrainingSheet } from "@/lib/types";

export default function TrainingSheetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const [sheet, setSheet] = useState<TrainingSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get<TrainingSheet>(`/api/training/${id}`).then(setSheet).catch((e) => setError(e.message));
  }, [id]);

  async function remove() {
    if (!sheet || !confirm(`Supprimer définitivement la fiche « ${sheet.title} » ?`)) return;
    setDeleting(true);
    try {
      await api.del(`/api/training/${sheet.id}`);
      router.push("/formation");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
      setDeleting(false);
    }
  }

  if (error && !sheet) return <ErrorBox message={error} />;
  if (!sheet) return <Spinner />;

  return (
    <>
      <Link href="/formation" className="mb-4 inline-flex items-center gap-1 text-sm text-cream-muted hover:text-cream">
        <ArrowLeft className="h-4 w-4" /> Formation
      </Link>
      <PageHeader
        title={sheet.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {sheet.category && <Badge color="#D9A441">{sheet.category}</Badge>}
            {!sheet.published && <Badge color="#7C8A99">Brouillon</Badge>}
            <span>
              Mis à jour le {formatDateTime(sheet.updatedAt)}
              {sheet.updatedByName && <> par {sheet.updatedByName}</>}
            </span>
          </span>
        }
        actions={
          can(PERM.trainingManage) && (
            <>
              <Link href={`/formation/${sheet.id}/modifier`}>
                <Button variant="secondary">
                  <Pencil className="h-4 w-4" /> Modifier
                </Button>
              </Link>
              <Button variant="danger" onClick={remove} loading={deleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )
        }
      />
      <ErrorBox message={error} />
      <Card className="max-w-4xl">
        {sheet.content.trim() ? <Markdown source={sheet.content} /> : <p className="text-sm text-cream-dim">Fiche vide.</p>}
      </Card>
    </>
  );
}
