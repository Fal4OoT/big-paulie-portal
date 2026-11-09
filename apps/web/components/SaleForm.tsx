"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { usePortal, useStatus } from "@/lib/portal-context";
import type { CatalogVehicle, ClientCoupons, Coupon, DataRecord, Sale } from "@/lib/types";
import { DynamicFields } from "./DynamicFields";
import { loadCatalog, VehicleSearch } from "./VehicleSearch";
import { Button, ErrorBox, Input, Label, Modal, Select, Toggle } from "./ui";

/** Création (clientId + clientData) ou modification (sale) d'une vente. */
export function SaleFormModal({
  open,
  onClose,
  onSaved,
  clientId,
  clientData,
  clientAlert,
  sale,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  clientId: string;
  clientData: DataRecord;
  /** Note interne du client marquée « alerte » : affichée en avertissement. */
  clientAlert?: string | null;
  sale?: Sale;
}) {
  const { config } = usePortal();
  const status = useStatus();
  const [vehicleName, setVehicleName] = useState(sale?.vehicleName ?? "");
  const [catalog, setCatalog] = useState<CatalogVehicle[] | null>(null);
  const [catalogVehicle, setCatalogVehicle] = useState<CatalogVehicle | null>(null);
  // Hors catalogue : nom libre (vente existante sans véhicule du catalogue, ou véhicule absent du panel).
  const [offCatalog, setOffCatalog] = useState(!!sale && !sale.catalogVehicleId);
  const [typeId, setTypeId] = useState(sale?.vehicleTypeId ?? "");
  const [price, setPrice] = useState(sale ? String(sale.price) : "");
  const [immediate, setImmediate] = useState(sale?.immediate ?? false);
  const [inStock, setInStock] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [couponId, setCouponId] = useState<string | null>(sale?.couponId ?? null);
  const [plate, setPlate] = useState(sale?.plate ?? "");
  const [data, setData] = useState<DataRecord>(sale?.data ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog()
      .then((list) => {
        setCatalog(list);
        if (list.length === 0) setOffCatalog(true);
        if (sale?.catalogVehicleId) {
          // Un véhicule retiré du catalogue depuis la vente reste affiché tel quel.
          setCatalogVehicle(
            list.find((v) => v.id === sale.catalogVehicleId) ?? {
              id: sale.catalogVehicleId,
              name: sale.vehicleName,
              segmentEmoji: null,
              segmentLabel: null,
              vehicleTypeId: null,
            },
          );
        }
      })
      .catch(() => {
        setCatalog([]);
        setOffCatalog(true);
      });
  }, [sale?.catalogVehicleId, sale?.vehicleName]);

  // Coupons utilisables : ceux disponibles du client, plus celui déjà appliqué à la vente modifiée.
  useEffect(() => {
    api
      .get<ClientCoupons>(`/api/clients/${clientId}/coupons`)
      .then((r) => setCoupons(r.coupons.filter((c) => c.status === "AVAILABLE" || (sale?.couponId && c.id === sale.couponId))))
      .catch(() => setCoupons([]));
  }, [clientId, sale?.couponId]);

  function selectVehicle(v: CatalogVehicle | null) {
    setCatalogVehicle(v);
    // Type déduit de la gamme du panel (modifiable ensuite).
    if (v?.vehicleTypeId && config.vehicleTypes.some((t) => t.id === v.vehicleTypeId && t.active)) setTypeId(v.vehicleTypeId);
  }

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
  const requiresPlate = type?.requiresPlate ?? config.categories.find((c) => c.id === type?.categoryId)?.requiresPlate ?? true;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!offCatalog && !catalogVehicle) return setError("Choisis le véhicule dans le catalogue.");
    if (offCatalog && !vehicleName.trim()) return setError("Indique le nom du véhicule.");
    if (!typeId) return setError("Choisis le type de véhicule.");
    const p = Number(price.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(p) || p < 0) return setError("Prix de vente invalide.");

    setSaving(true);
    try {
      const body = {
        clientId,
        catalogVehicleId: offCatalog ? null : catalogVehicle?.id ?? null,
        vehicleName: offCatalog ? vehicleName : catalogVehicle?.name ?? "",
        vehicleTypeId: typeId,
        price: p,
        immediate: inStock ? false : immediate,
        inStock: sale ? undefined : inStock,
        couponId,
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
        {clientAlert && (
          <div className="flex items-start gap-3 rounded-md border border-paulie-red/60 bg-paulie-red/15 px-4 py-3 text-sm text-red-100">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <span className="whitespace-pre-line">
              <strong>Note interne du client :</strong> {clientAlert}
            </span>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="vehicle" required>
              Véhicule
            </Label>
            {catalog === null ? (
              <div className="flex h-10 items-center text-sm text-cream-dim">Chargement du catalogue…</div>
            ) : offCatalog ? (
              <Input id="vehicle" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} maxLength={120} autoFocus placeholder="Nom du véhicule" />
            ) : (
              <VehicleSearch catalog={catalog} value={catalogVehicle} onSelect={selectVehicle} autoFocus={!sale} />
            )}
            {catalog !== null && catalog.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOffCatalog(!offCatalog);
                  if (!offCatalog && catalogVehicle) setVehicleName(catalogVehicle.name);
                }}
                className="mt-1 text-xs text-cream-dim underline-offset-2 hover:text-cream hover:underline"
              >
                {offCatalog ? "← Choisir dans le catalogue" : "Véhicule absent du catalogue ?"}
              </button>
            )}
            {offCatalog && catalog !== null && (
              <p className="mt-1 text-xs text-sand">
                {catalog.length === 0
                  ? "Catalogue vide : importe-le dans Configuration → Catalogue pour des noms uniformes."
                  : "Hors catalogue : la vente sera comptée à part dans l'analyse."}
              </p>
            )}
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

        {coupons && coupons.length > 0 && sale?.status !== "CANCELLED" && (
          <fieldset className="rounded-lg border border-night-500/70 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-cream-muted">Coupon de promotion (non cumulable)</legend>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input type="radio" name="coupon" checked={couponId === null} onChange={() => setCouponId(null)} className="h-4 w-4 accent-[#D9A441]" />
                Aucun coupon
              </label>
              {coupons.map((c) => (
                <label key={c.id} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <input type="radio" name="coupon" checked={couponId === c.id} onChange={() => setCouponId(c.id)} className="h-4 w-4 accent-[#D9A441]" />
                  <strong>{c.percent} %</strong>
                  <span className="font-mono text-xs text-sand">{c.reference}</span>
                  <span className="text-cream-muted">{c.reason}</span>
                  {c.expiresOn && <span className="text-xs text-cream-dim">· expire le {formatDate(c.expiresOn)}</span>}
                </label>
              ))}
            </div>
            {couponId && (
              <p className="mt-3 text-xs text-sand">Le prix n'est pas recalculé : saisis le prix remisé. Le coupon sera marqué comme utilisé sur cet achat.</p>
            )}
          </fieldset>
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
