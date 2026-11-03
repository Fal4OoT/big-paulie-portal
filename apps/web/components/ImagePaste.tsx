"use client";

import { ClipboardPaste, ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ClipboardEvent } from "react";
import { fileUrl, uploadImage } from "@/lib/api";
import { cn } from "@/lib/format";

/**
 * Zone d'image : clic puis Ctrl+V pour coller une capture, glisser-déposer ou choisir un fichier.
 * La valeur est l'identifiant du fichier stocké côté API.
 */
export function ImagePaste({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleBlob(blob: Blob | null | undefined) {
    if (!blob) return;
    if (!blob.type.startsWith("image/")) {
      setError("Ce n'est pas une image.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadImage(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: ClipboardEvent) {
    if (disabled) return;
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      void handleBlob(item.getAsFile());
    } else {
      setError("Le presse-papiers ne contient pas d'image.");
    }
  }

  if (value) {
    return (
      <div className="group relative overflow-hidden rounded-lg border border-night-500 bg-night-900">
        <a href={fileUrl(value)} target="_blank" rel="noreferrer" title="Ouvrir en grand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(value)} alt="" className="h-40 w-full object-contain" />
        </a>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-md bg-night-900/90 p-1.5 text-cream-muted opacity-100 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
            title="Retirer l'image"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 rounded-lg border border-dashed border-night-500 text-sm text-cream-dim">
        <ImageOff className="h-4 w-4" /> Non renseigné
      </div>
    );
  }

  return (
    <div>
      <div
        tabIndex={0}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleBlob(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center text-sm transition-colors",
          focused ? "border-sand bg-sand/10 text-cream" : "border-night-500 text-cream-muted hover:border-cream-dim",
        )}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-sand" />
        ) : (
          <>
            <ClipboardPaste className="h-6 w-6" />
            <span>{focused ? "Colle l'image (Ctrl+V)" : "Clique ici puis Ctrl+V"}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="inline-flex items-center gap-1 text-xs text-cream-dim underline-offset-2 hover:text-cream hover:underline"
            >
              <Upload className="h-3 w-3" /> ou choisir un fichier
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void handleBlob(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
