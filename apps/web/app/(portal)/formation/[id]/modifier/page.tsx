"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TrainingEditor } from "@/components/TrainingEditor";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { PERM, useCan } from "@/lib/portal-context";
import type { TrainingSheet } from "@/lib/types";

export default function EditTrainingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const [sheet, setSheet] = useState<TrainingSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TrainingSheet>(`/api/training/${id}`).then(setSheet).catch((e) => setError(e.message));
  }, [id]);

  if (!can(PERM.trainingManage)) return <ErrorBox message="Ton grade ne permet pas de modifier les fiches de formation." />;
  if (error) return <ErrorBox message={error} />;
  if (!sheet) return <Spinner />;
  return (
    <>
      <PageHeader title="Modifier la fiche" subtitle={sheet.title} />
      <TrainingEditor sheet={sheet} onSaved={(sid) => router.push(`/formation/${sid}`)} onCancel={() => router.push(`/formation/${sheet.id}`)} />
    </>
  );
}
