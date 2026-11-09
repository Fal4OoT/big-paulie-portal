"use client";

import { CalendarClock, MessageSquare, PhoneCall, PhoneMissed, PhoneOff, UserCheck, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn, formatAppointment, formatDateTime, formatRelative, nextHalfHourInput, toParisInput } from "@/lib/format";
import { CONTACT_LABELS, type ContactOutcome, type Sale, type SaleContact } from "@/lib/types";
import { Button, ErrorBox, Input, Label, Modal } from "./ui";

const OUTCOMES: { key: ContactOutcome; icon: typeof PhoneCall }[] = [
  { key: "NO_ANSWER", icon: PhoneMissed },
  { key: "MESSAGE", icon: MessageSquare },
  { key: "REACHED", icon: UserCheck },
  { key: "APPOINTMENT", icon: CalendarClock },
];

export const OUTCOME_ICON: Record<ContactOutcome, typeof PhoneCall> = {
  NO_ANSWER: PhoneMissed,
  MESSAGE: MessageSquare,
  REACHED: UserCheck,
  APPOINTMENT: CalendarClock,
};

/** Dernier appel noté sur une vente : « 📵 Pas de réponse · il y a 20 min (Tony) ». */
export function LastContact({ sale, className }: { sale: Sale; className?: string }) {
  if (!sale.lastContact) return null;
  const Icon = OUTCOME_ICON[sale.lastContact.outcome] ?? PhoneOff;
  return (
    <div className={cn("flex items-center gap-1 text-xs text-cream-muted", className)} title={sale.lastContact.note ?? undefined}>
      <Icon className="h-3 w-3 shrink-0 text-cream-dim" />
      <span className="truncate">
        {CONTACT_LABELS[sale.lastContact.outcome]} · {formatRelative(sale.lastContact.at)}
        {sale.lastContact.byName && ` (${sale.lastContact.byName})`}
        {sale.contactCount > 1 && ` · ${sale.contactCount} appels`}
      </span>
    </div>
  );
}

/** Badge du rendez-vous de livraison. */
export function DeliveryBadge({ at, className }: { at: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded bg-paulie-green/25 px-1.5 py-0.5 text-xs text-emerald-100", className)}
      title={`Rendez-vous de livraison : ${formatDateTime(at)}`}
    >
      <CalendarClock className="h-3 w-3" /> RDV {formatAppointment(at)}
    </span>
  );
}

/** Noter un appel au client (facultatif : n'empêche jamais de changer le statut). */
export function ContactDialog({ sale, onClose, onSaved }: { sale: Sale; onClose: () => void; onSaved: () => void }) {
  const [outcome, setOutcome] = useState<ContactOutcome | null>(null);
  const [note, setNote] = useState("");
  const [at, setAt] = useState(sale.deliveryAt ? toParisInput(sale.deliveryAt) : nextHalfHourInput());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!outcome) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/sales/${sale.id}/contacts`, {
        outcome,
        note: note.trim() || null,
        appointmentAt: outcome === "APPOINTMENT" ? at || null : null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Appel · ${sale.clientName}`}>
      <div className="space-y-4">
        <p className="text-sm text-cream-muted">
          {sale.reference} · {sale.vehicleName}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {OUTCOMES.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setOutcome(key)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                outcome === key ? "border-sand bg-sand/15 text-cream" : "border-night-500 text-cream-muted hover:text-cream",
              )}
            >
              <Icon className="h-4 w-4" /> {CONTACT_LABELS[key]}
            </button>
          ))}
        </div>
        {outcome === "APPOINTMENT" && (
          <div>
            <Label>Rendez-vous de livraison (heure de Paris)</Label>
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
            <p className="mt-1 text-xs text-cream-dim">Facultatif : laisse vide si l'heure n'est pas encore fixée.</p>
          </div>
        )}
        <div>
          <Label>Note (facultatif)</Label>
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="ex : rappeler après 20h, livrer au port…" />
        </div>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} disabled={!outcome} loading={saving}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Saisie directe du rendez-vous de livraison (fiche vente). */
export function DeliveryEditor({ sale, onSaved }: { sale: Sale; onSaved: () => void }) {
  const [value, setValue] = useState(toParisInput(sale.deliveryAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== toParisInput(sale.deliveryAt);

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/sales/${sale.id}/delivery`, { deliveryAt: next });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="w-56" />
        <Button size="sm" variant="secondary" disabled={!dirty || !value} loading={saving} onClick={() => save(value)}>
          Enregistrer
        </Button>
        {sale.deliveryAt && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => save(null)} title="Retirer le rendez-vous">
            <X className="h-4 w-4" /> Retirer
          </Button>
        )}
      </div>
      <ErrorBox message={error} />
    </div>
  );
}

/** Historique des appels d'une vente. */
export function ContactHistory({ contacts }: { contacts: SaleContact[] }) {
  if (contacts.length === 0) return <p className="text-sm text-cream-dim">Aucun appel noté.</p>;
  return (
    <ul className="space-y-2">
      {contacts.map((c) => {
        const Icon = OUTCOME_ICON[c.outcome] ?? PhoneOff;
        return (
          <li key={c.id} className="flex gap-2 text-sm">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cream-dim" />
            <div>
              <span className="font-medium">{CONTACT_LABELS[c.outcome]}</span>
              {c.appointmentAt && <span className="text-emerald-200"> · RDV {formatDateTime(c.appointmentAt)}</span>}
              {c.note && <span className="text-cream-muted"> · {c.note}</span>}
              <div className="text-xs text-cream-dim">
                {formatDateTime(c.at)}
                {c.actorName && ` · ${c.actorName}`}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
