"use client";

import { Bold, Heading2, ImagePlus, Italic, Lightbulb, List, ListOrdered, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { api, uploadImage } from "@/lib/api";
import { cn } from "@/lib/format";
import type { TrainingSheet, TrainingSummary } from "@/lib/types";
import { Markdown } from "./Markdown";
import { Button, Card, ErrorBox, Input, Label, Toggle } from "./ui";

/** Création ou modification d'une fiche de formation, avec aperçu en direct. */
export function TrainingEditor({ sheet, onSaved, onCancel }: { sheet?: TrainingSheet; onSaved: (id: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(sheet?.title ?? "");
  const [category, setCategory] = useState(sheet?.category ?? "");
  const [content, setContent] = useState(sheet?.content ?? "");
  const [published, setPublished] = useState(sheet?.published ?? true);
  const [sortOrder, setSortOrder] = useState(sheet?.sortOrder ?? 0);
  const [categories, setCategories] = useState<string[]>([]);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<TrainingSummary[]>("/api/training")
      .then((list) => setCategories([...new Set(list.map((s) => s.category).filter((c): c is string => !!c))].sort()))
      .catch(() => undefined);
  }, []);

  /** Entoure la sélection (ou insère un modèle) dans la zone de texte. */
  function wrap(before: string, after = "", placeholder = "") {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + before + selected + after + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  /** Préfixe chaque ligne sélectionnée (titres, listes, astuce). */
  function prefixLines(prefix: (i: number) => string) {
    const el = area.current;
    if (!el) return;
    const s = content.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const eIdx = content.indexOf("\n", el.selectionEnd);
    const e = eIdx === -1 ? content.length : eIdx;
    const block = content.slice(s, e).split("\n").map((l, i) => prefix(i) + l).join("\n");
    setContent(content.slice(0, s) + block + content.slice(e));
    requestAnimationFrame(() => el.focus());
  }

  async function insertImage(file: Blob) {
    setUploading(true);
    setError(null);
    try {
      const id = await uploadImage(file);
      const el = area.current;
      const pos = el?.selectionStart ?? content.length;
      const snippet = `\n![image](/api/files/${id})\n`;
      setContent((c) => c.slice(0, pos) + snippet + c.slice(pos));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi de l'image impossible.");
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void insertImage(file);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { title, category: category || null, content, published, sortOrder };
      if (sheet) {
        await api.put(`/api/training/${sheet.id}`, body);
        onSaved(sheet.id);
      } else {
        const r = await api.post<{ id: string }>("/api/training", body);
        onSaved(r.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  const tools: { icon: typeof Bold; label: string; run: () => void }[] = [
    { icon: Heading2, label: "Titre", run: () => prefixLines(() => "## ") },
    { icon: Bold, label: "Gras", run: () => wrap("**", "**", "texte") },
    { icon: Italic, label: "Italique", run: () => wrap("*", "*", "texte") },
    { icon: List, label: "Liste", run: () => prefixLines(() => "- ") },
    { icon: ListOrdered, label: "Étapes numérotées", run: () => prefixLines((i) => `${i + 1}. `) },
    { icon: Lightbulb, label: "Astuce", run: () => prefixLines(() => "> 💡 ") },
  ];

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_6rem]">
          <div>
            <Label htmlFor="t-title" required>
              Titre
            </Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus={!sheet} placeholder="ex : Accueillir un client" />
          </div>
          <div>
            <Label htmlFor="t-cat">Catégorie</Label>
            <Input id="t-cat" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} list="t-cats" placeholder="ex : Vente" />
            <datalist id="t-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="t-order">Ordre</Label>
            <Input id="t-order" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </div>
        </div>
        <div className="mt-4">
          <Toggle checked={published} onChange={setPublished} label={published ? "Publiée (visible par tout le monde)" : "Brouillon (visible seulement par ceux qui gèrent les formations)"} />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-1">
          {tools.map(({ icon: Icon, label, run }) => (
            <button key={label} type="button" onClick={run} title={label} className="rounded p-2 text-cream-muted hover:bg-night-700 hover:text-cream">
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} title="Image" className="rounded p-2 text-cream-muted hover:bg-night-700 hover:text-cream">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void insertImage(f);
            }}
          />
          <span className="ml-2 hidden text-xs text-cream-dim sm:inline">Astuce : colle une capture d'écran directement avec Ctrl+V.</span>
          <div className="ml-auto flex overflow-hidden rounded-md border border-night-500 lg:hidden">
            {(["edit", "preview"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn("px-3 py-1 text-xs", tab === t ? "bg-night-600 text-cream" : "text-cream-muted")}
              >
                {t === "edit" ? "Écrire" : "Aperçu"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <textarea
            ref={area}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={onPaste}
            spellCheck
            placeholder={"## Titre de section\nTexte de la fiche…\n\n- un point\n- un autre point\n\n> 💡 Une astuce"}
            className={cn(
              "min-h-[28rem] w-full rounded-md border border-night-500 bg-night-900 px-3 py-2 font-mono text-sm text-cream placeholder:text-cream-dim focus:border-sand focus:outline-none",
              tab === "preview" && "hidden lg:block",
            )}
          />
          <div className={cn("min-h-[28rem] rounded-md border border-night-500/60 bg-night-900/40 p-4", tab === "edit" && "hidden lg:block")}>
            {content.trim() ? <Markdown source={content} /> : <p className="text-sm text-cream-dim">L'aperçu s'affiche ici.</p>}
          </div>
        </div>
      </Card>

      <ErrorBox message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" loading={saving} disabled={uploading}>
          {sheet ? "Enregistrer" : "Créer la fiche"}
        </Button>
      </div>
    </form>
  );
}
