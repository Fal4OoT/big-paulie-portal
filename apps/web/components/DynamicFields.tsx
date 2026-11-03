"use client";

import { ageFrom, cn, formatDate } from "@/lib/format";
import type { DataRecord, FieldDefinition, FieldValue } from "@/lib/types";
import { ImagePaste } from "./ImagePaste";
import { Input, Label, Select, Textarea } from "./ui";

/** Formulaire généré depuis un modèle configurable. Les champs image occupent une grille dédiée. */
export function DynamicFields({
  fields,
  value,
  onChange,
  disabled,
}: {
  fields: FieldDefinition[];
  value: DataRecord;
  onChange: (next: DataRecord) => void;
  disabled?: boolean;
}) {
  const set = (key: string, v: FieldValue) => onChange({ ...value, [key]: v });
  const regular = fields.filter((f) => f.type !== "image");
  const images = fields.filter((f) => f.type === "image");

  return (
    <div className="space-y-6">
      {regular.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {regular.map((f) => (
            <div key={f.key} className={cn(f.type === "textarea" && "sm:col-span-2")}>
              <FieldInput field={f} value={value[f.key]} onChange={(v) => set(f.key, v)} disabled={disabled} />
            </div>
          ))}
        </div>
      )}
      {images.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((f) => (
            <div key={f.key}>
              <Label required={f.required}>{f.label}</Label>
              <ImagePaste
                value={typeof value[f.key] === "string" ? (value[f.key] as string) : null}
                onChange={(id) => set(f.key, id)}
                disabled={disabled}
              />
              {f.help && <p className="mt-1 text-xs text-cream-dim">{f.help}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
  disabled,
}: {
  field: FieldDefinition;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  disabled?: boolean;
}) {
  const id = `f-${f.key}`;
  const str = value === null || value === undefined ? "" : String(value);

  if (f.type === "checkbox") {
    return (
      <label className="flex h-full items-center gap-3 pt-5 text-sm">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 accent-[#2F7D53]"
        />
        {f.label}
        {f.required && <span className="text-sunset">*</span>}
      </label>
    );
  }

  let input;
  switch (f.type) {
    case "textarea":
      input = <Textarea id={id} value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={4000} />;
      break;
    case "select":
      input = (
        <Select id={id} value={str} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
      break;
    case "date":
      input = <Input id={id} type="date" value={str} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} />;
      break;
    case "number":
      input = <Input id={id} type="number" step="any" value={str} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} disabled={disabled} />;
      break;
    case "phone":
      input = <Input id={id} type="tel" value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={30} />;
      break;
    default:
      input = <Input id={id} value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={200} />;
  }

  const age = f.type === "date" && f.key === "date_naissance" ? ageFrom(str) : null;
  return (
    <div>
      <Label htmlFor={id} required={f.required}>
        {f.label}
      </Label>
      {input}
      {(f.help || age !== null) && (
        <p className="mt-1 text-xs text-cream-dim">
          {age !== null && <span className="text-cream-muted">{age} ans. </span>}
          {f.help}
        </p>
      )}
    </div>
  );
}

/** Affichage en lecture seule d'une valeur (fiche client, détail de vente). */
export function FieldDisplay({ field, value }: { field: FieldDefinition; value: FieldValue }) {
  if (value === null || value === undefined || value === "") return <span className="text-cream-dim">—</span>;
  if (field.type === "checkbox") return <span>{value === true ? "Oui" : "Non"}</span>;
  if (field.type === "date") {
    const age = field.key === "date_naissance" ? ageFrom(String(value)) : null;
    return (
      <span>
        {formatDate(String(value))}
        {age !== null && <span className="text-cream-muted"> · {age} ans</span>}
      </span>
    );
  }
  return <span className="whitespace-pre-line break-words">{String(value)}</span>;
}
