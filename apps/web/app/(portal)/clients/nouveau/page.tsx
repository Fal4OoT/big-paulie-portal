"use client";

import { useRouter } from "next/navigation";
import { ClientForm } from "@/components/ClientForm";
import { Card, PageHeader } from "@/components/ui";

export default function NewClientPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="Nouveau client" subtitle="Les permis se collent directement (clic sur la zone puis Ctrl+V)." />
      <Card>
        <ClientForm onSaved={(id) => router.push(`/clients/${id}`)} onCancel={() => router.push("/clients")} />
      </Card>
    </>
  );
}
