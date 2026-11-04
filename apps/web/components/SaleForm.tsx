"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { usePortal, useStatus } from "@/lib/portal-context";
import type { DataRecord, Sale } from "@/lib/types";
import { DynamicFields } from "./DynamicFields";
import { Button, ErrorBox, Input, Label, Modal, Select, Toggle } from "./ui";

/** Création (clientId + clientData) ou modification (sale) d'une vente. */
export function SaleFormModal({
  open,
  onClose,
  onSaved,
  clientId,
  clientData,
  sale,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  clientId: string;
  clientData: DataRecord;
  sale?: Sale;
}) {
  const { config } = usePortal();
  const status = useStatus();
  const [vehicleName, setVehicleName] = useState(sale?.vehicleName ?? "");
  const [typeId, setTypeId] = useState(sale?.vehicleTypeId ?? "");
  const [price, setPrice] = useState(sale ? String(sale.price) : "");
  const [immediate, setImmediate] = useState(sale?.immediate ?? false);
  const [inStock, setInStock] = useState(false);
  const [plate, setPlate] = useState(sale?.plate ?? "");
  const [data, setData] = useState<DataRecord>(sale?.data ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Types proposés, groupés par catégorie (un type désactivé reste visible s'il est celui de la vente).
  const groups = useMemo(
    () =>
      config.categories
        .filter((c) => c.active || config.vehicleTypes.some((t) => t.categoryId === c.id && t.id === sale?.vehicleTypeId))
        .map((c) => ({
          category: c,
          types: config.vehicleTypes.filter((t) => t.categoryId === c.id && (t.active || t.id === sale?.vehicleTypeId)),
        }))
        .filter((g) => g.types.length > 0),
    [config, sale?.vehicleTypeId],
  );

  const type = config.vehicleTypes.find((t) => t.id === typeId);
  const permitField = type?.permitFieldKey ? config.clientFields.find((f) => f.key === type.permitFieldKey) : undefined;
  const permitMissing = !!type?.permitFieldKey && !clientData[type.permitFieldKey];
  const requiresPlate = config.categories.find((c) => c.id === type?.categoryId)?.requiresPlate ?? true;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!typeId) return setError("Choisis le type de véhicule.");
    const p = Number(price.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(p) || p < 0) return setError("Prix de vente invalide.");

    setSaving(true);
    try {
      const body = {
        clientId,
        vehicleName,
        vehicleTypeId: typeId,
        price: p,
        immediate: inStock ? false : immediate,
        inStock: sale ? undefined : inStock,
        plate: requiresPlate ? plate || null : null,
        data,
      };
      if (sale) {
        await api.put(`/api/sales/${sale.id}`, body);
        onSaved(sale.id);
      } else {
        const res = await api.post<{ id: string }>("/api/sales", body);
        onSaved(res.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={sale ? `Modifier ${sale.reference}` : "Nouvel achat"} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="vehicle" required>
              Nom du véhicule
            </Label>
            <Input id="vehicle" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} maxLength={120} required autoFocus placeholder="ex : Pegassi Bati 801" />
          </div>
          <div>
            <Label htmlFor="type" required>
              Type
            </Label>
            <Select id="type" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
              <option value="">Choisir…</option>
              {groups.map((g) => (
                <optgroup key={g.category.id} label={g.category.label}>
                  {g.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="price" required>
              Prix de vente ($)
            </Label>
            <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="0" />
          </div>
          {sale?.status === "DELIVERED" && requiresPlate && (
            <div>
              <Label htmlFor="plate" required>
                Plaque
              </Label>
              <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} maxLength={16} required />
            </div>
          )}
          <div className="space-y-3 sm:col-span-2">
            {!sale && (
              <Toggle
                checked={inStock}
                onChange={(v) => {
                  setInStock(v);
                  if (v) setImmediate(false);
                }}
                label={`Véhicule en stock à la concession (la vente passe directement en « ${status("RECEIVED").label} »)`}
              />
            )}
            {!inStock && !sale?.fromStock && (
              <Toggle checked={immediate} onChange={setImmediate} label="Le client veut le véhicule immédiatement (on part le chercher tout de suite)" />
            )}
          </div>
        </div>

        {permitMissing && (
          <div className="flex items-start gap-3 rounded-md border border-sand/50 bg-sand/10 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sand" />
            <span>
              Le client n'a pas de « {permitField?.label ?? "permis"} » renseigné. La vente reste possible, elle sera signalée.
            </span>
          </div>
        )}

        {config.saleFields.length > 0 && <DynamicFields fields={config.saleFields} value={data} onChange={setData} />}

        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={saving}>
            {sale ? "Enregistrer" : "Enregistrer la vente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
