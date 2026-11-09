"use client";

import { Pencil, ShieldAlert, StickyNote } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { PERM, useCan } from "@/lib/portal-context";
import type { Client } from "@/lib/types";
import { Button, Card, ErrorBox, Textarea, Toggle } from "./ui";

/** Note interne de la fiche client (visible des employés uniquement). */
export function ClientNote({ client, onSaved }: { client: Client; onSaved: () => void }) {
  const can = useCan();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(client.internalNote ?? "");
  const [alert, setAlert] = useState(client.noteAlert);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = can(PERM.clientsNote);

  if (!client.internalNote && !canEdit) return null;

  function start() {
    setText(client.internalNote ?? "");
    setAlert(client.noteAlert);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/clients/${client.id}/note`, { text: text.trim() || null, alert });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-sand" /> Note interne
        </span>
      }
      actions={
        canEdit &&
        !editing && (
          <Button size="sm" variant="ghost" onClick={start}>
            <Pencil className="h-4 w-4" /> {client.internalNote ? "Modifier" : "Ajouter"}
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={text}
            maxLength={1000}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder="ex : client VIP, paie toujours en retard, ne pas vendre d'aérien sans l'accord du Patron…"
            autoFocus
          />
          <Toggle checked={alert} onChange={setAlert} label="Alerte : afficher cette note en avertissement à chaque vente (et dans la tournée)" />
          <ErrorBox message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <Button onClick={save} loading={saving}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : client.internalNote ? (
        <div>
          {client.noteAlert && (
            <div className="mb-2 inline-flex items-center gap-1 rounded bg-paulie-red/20 px-2 py-0.5 text-xs text-red-200">
              <ShieldAlert className="h-3 w-3" /> Alerte affichée à la vente
            </div>
          )}
          <p className="whitespace-pre-line text-sm">{client.internalNote}</p>
          {client.noteUpdatedAt && (
            <p className="mt-2 text-xs text-cream-dim">
              Mise à jour le {formatDateTime(client.noteUpdatedAt)}
              {client.noteUpdatedByName && ` par ${client.noteUpdatedByName}`}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-cream-dim">Aucune note. Visible uniquement par les employés, jamais par le client.</p>
      )}
    </Card>
  );
}
