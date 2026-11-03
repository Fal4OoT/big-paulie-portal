"use client";

import { Save } from "lucide-react";
import { Button, ErrorBox } from "../ui";

/** Barre d'enregistrement commune aux éditeurs de configuration. */
export function SaveBar({
  dirty,
  saving,
  error,
  done,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  done: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-10 mt-6 space-y-3">
      <ErrorBox message={error} />
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-night-500 bg-night-900/95 px-4 py-3 shadow-sign backdrop-blur">
        <span className="mr-auto text-sm text-cream-muted">
          {dirty ? "Modifications non enregistrées." : done ? "✔ Enregistré." : "À jour."}
        </span>
        <Button variant="ghost" onClick={onReset} disabled={!dirty || saving}>
          Annuler
        </Button>
        <Button onClick={onSave} disabled={!dirty} loading={saving}>
          <Save className="h-4 w-4" /> Enregistrer
        </Button>
      </div>
    </div>
  );
}

/** Hook utilitaire : copie de travail + détection des modifications. */
export function stableJson(v: unknown) {
  return JSON.stringify(v);
}
