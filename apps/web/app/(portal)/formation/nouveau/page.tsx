"use client";

import { useRouter } from "next/navigation";
import { TrainingEditor } from "@/components/TrainingEditor";
import { ErrorBox, PageHeader } from "@/components/ui";
import { PERM, useCan } from "@/lib/portal-context";

export default function NewTrainingPage() {
  const router = useRouter();
  const can = useCan();
  if (!can(PERM.trainingManage)) return <ErrorBox message="Ton grade ne permet pas de créer des fiches de formation." />;
  return (
    <>
      <PageHeader title="Nouvelle fiche" subtitle="Rédige la fiche à gauche, l'aperçu s'affiche à droite." />
      <TrainingEditor onSaved={(id) => router.push(`/formation/${id}`)} onCancel={() => router.push("/formation")} />
    </>
  );
}
