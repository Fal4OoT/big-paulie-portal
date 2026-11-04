"use client";

import { ClipboardPaste, FileUp, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { usePortal } from "@/lib/portal-context";
import type { CatalogAdmin, CatalogImportResult, CatalogSegment } from "@/lib/types";
import { loadCatalog } from "../VehicleSearch";
import { Button, Card, ErrorBox, Input, Select, Spinner } from "../ui";
import { SaveBar, stableJson } from "./SaveBar";

export function CatalogEditor() {
  const { config } = usePortal();
  const [admin, setAdmin] = useState<CatalogAdmin | null>(null);
  const [segments, setSegments] = useState<CatalogSegment[]>([]);
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<CatalogImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | "segments" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segError, setSegError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [segDone, setSegDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const a = await api.get<CatalogAdmin>("/api/admin/catalog");
    setAdmin(a);
    setSegments(a.segments);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function run(apply: boolean) {
    setBusy(apply ? "apply" : "preview");
    setError(null);
    setDone(null);
    try {
      const r = await api.post<CatalogImportResult>("/api/admin/catalog/import", { json, apply });
      if (apply) {
        setPreview(null);
        setJson("");
        setDone(
          `Catalogue importé : ${r.total} véhicules actifs.` + (r.linkedSales > 0 ? ` ${r.linkedSales} ancienne(s) vente(s) rattachée(s) au catalogue.` : ""),
        );
        await Promise.all([load(), loadCatalog(true)]);
      } else {
        setPreview(r);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSegments() {
    setBusy("segments");
    setSegError(null);
    try {
      await api.put("/api/admin/catalog/segments", segments.map(({ emoji, label, vehicleTypeId }) => ({ emoji, label, vehicleTypeId })));
      await Promise.all([load(), loadCatalog(true)]);
      setSegDone(true);
    } catch (e) {
      setSegError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(null);
    }
  }

  if (!admin) return error ? <ErrorBox message={error} /> : <Spinner />;

  const types = config.vehicleTypes.filter((t) => t.active);
  const segDirty = stableJson(segments) !== stableJson(admin.segments);
  const changes = preview ? preview.added.length + preview.renamed.length + preview.removed.length + preview.reactivated.length + preview.movedSegment : 0;

  return (
    <div className="space-y-6">
      <Card
        title="Importer depuis le panel légal"
        actions={
          <span className="text-xs text-cream-muted">
            {admin.activeCount} véhicule(s) · dernier import : {admin.lastImportAt ? formatDateTime(admin.lastImportAt) : "jamais"}
          </span>
        }
      >
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-cream-muted">
          <li>Ouvre le panel légal, connecte-toi et affiche la page de la concession.</li>
          <li>
            <kbd className="rounded bg-night-600 px-1.5 text-xs">F12</kbd> → onglet <strong>Network</strong> → filtre <strong>Fetch/XHR</strong> →{" "}
            <kbd className="rounded bg-night-600 px-1.5 text-xs">F5</kbd>.
          </li>
          <li>
            Clic droit sur la ligne <code className="text-sand">data?company=soc-bigpaulie…</code> → <strong>Copy</strong> → <strong>Copy response</strong>.
          </li>
          <li>Colle ci-dessous, puis « Vérifier ». Seuls les noms et catégories des véhicules sont lus, le reste est ignoré.</li>
        </ol>

        <textarea
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setPreview(null);
          }}
          placeholder='{"company": {"id": "soc-bigpaulie", …}, "products": [ … ] }'
          spellCheck={false}
          className="h-40 w-full rounded-md border border-night-500 bg-night-900 px-3 py-2 font-mono text-xs text-cream placeholder:text-cream-dim focus:border-sand focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => run(false)} disabled={!json.trim()} loading={busy === "preview"}>
            <ClipboardPaste className="h-4 w-4" /> Vérifier
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" /> Ou choisir un fichier
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) {
                setJson(await f.text());
                setPreview(null);
              }
            }}
          />
          {json && <span className="text-xs text-cream-dim">{Math.round(json.length / 1024)} Ko collés</span>}
        </div>

        {error && (
          <div className="mt-4">
            <ErrorBox message={error} />
          </div>
        )}
        {done && <div className="mt-4 rounded-md border border-paulie-green-bright/50 bg-paulie-green/20 px-4 py-3 text-sm">{done}</div>}

        {preview && (
          <div className="mt-5 rounded-lg border border-night-500 bg-night-900/60 p-4">
            <div className="mb-3 text-sm">
              {preview.company && <strong>{preview.company} · </strong>}
              {preview.total} véhicule(s) actif(s) dans le panel.
              {changes === 0 && " Aucun changement par rapport au catalogue actuel."}
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <PreviewList title="Ajoutés" items={preview.added} color="text-green-300" />
              <PreviewList title="Renommés" items={preview.renamed.map((r) => `${r.from} → ${r.to}`)} color="text-amber-200" />
              <PreviewList title="Retirés (masqués)" items={preview.removed} color="text-red-300" />
              <PreviewList title="Réactivés" items={preview.reactivated} color="text-green-300" />
            </div>
            {preview.movedSegment > 0 && <p className="mt-3 text-xs text-cream-muted">{preview.movedSegment} véhicule(s) changent de gamme.</p>}
            {preview.unknownSegments.length > 0 && (
              <p className="mt-3 text-xs text-sand">
                Nouvelle(s) gamme(s) : {preview.unknownSegments.join(" ")}. Pense à leur attribuer un type ci-dessous après l'import.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button onClick={() => run(true)} loading={busy === "apply"}>
                <RefreshCw className="h-4 w-4" /> Importer
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {admin.offCatalogSales > 0 && (
          <p className="mt-4 text-xs text-cream-dim">
            {admin.offCatalogSales} vente(s) hors catalogue (nom libre). Elles sont comptées à part dans l'analyse.
          </p>
        )}
      </Card>

      <Card title="Gammes du panel">
        <p className="mb-4 text-sm text-cream-muted">
          Chaque gamme (emoji du panel) donne le type pré-sélectionné à la vente et sert de regroupement dans l'analyse.
        </p>
        <div className="space-y-2">
          {segments.map((s, i) => (
            <div key={s.emoji} className="grid items-center gap-3 sm:grid-cols-[3rem_1fr_1fr_6rem]">
              <span className="text-2xl" aria-hidden>
                {s.emoji}
              </span>
              <Input
                value={s.label}
                maxLength={40}
                onChange={(e) => {
                  setSegDone(false);
                  setSegments((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)));
                }}
              />
              <Select
                value={s.vehicleTypeId ?? ""}
                onChange={(e) => {
                  setSegDone(false);
                  setSegments((x) => x.map((y, j) => (j === i ? { ...y, vehicleTypeId: e.target.value || null } : y)));
                }}
              >
                <option value="">— Type à choisir à la vente —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <span className="text-right text-xs text-cream-dim">{s.vehicleCount} véhicule(s)</span>
            </div>
          ))}
        </div>
        <SaveBar
          dirty={segDirty}
          saving={busy === "segments"}
          error={segError}
          done={segDone}
          onSave={saveSegments}
          onReset={() => setSegments(admin.segments)}
        />
      </Card>
    </div>
  );
}

function PreviewList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className={`mb-1 text-xs font-semibold uppercase tracking-wider ${color}`}>
        {title} ({items.length})
      </div>
      <ul className="max-h-40 overflow-y-auto text-xs text-cream-muted">
        {items.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
