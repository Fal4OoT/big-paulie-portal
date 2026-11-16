"use client";

import { Sparkles, X } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/format";
import { themeDef, type ThemeDef } from "@/lib/themes";
import type { ThemeSetting } from "@/lib/types";

/** Bandeau festif en haut des pages, avec le bouton qui coupe les animations (pour soi). */
export function ThemeBanner({
  theme,
  fx,
  onToggleFx,
  preview,
  onStopPreview,
}: {
  theme: ThemeSetting;
  fx: boolean;
  onToggleFx: () => void;
  preview: boolean;
  onStopPreview: () => void;
}) {
  const def = themeDef(theme.key);
  if (!def) return null;
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2.5 text-sm text-cream shadow-sign"
      style={{ background: def.gradient }}
      role="note"
    >
      <span className="text-xl leading-none" aria-hidden>
        {def.emoji}
      </span>
      <span className="font-medium">{theme.message || def.defaultMessage}</span>
      <span className="ml-auto flex items-center gap-2">
        {preview && (
          <button onClick={onStopPreview} className="inline-flex items-center gap-1 rounded-md bg-black/25 px-2 py-1 text-xs hover:bg-black/40">
            <X className="h-3 w-3" /> Fin de l&apos;aperçu
          </button>
        )}
        <button
          onClick={onToggleFx}
          className="inline-flex items-center gap-1 rounded-md bg-black/25 px-2 py-1 text-xs hover:bg-black/40"
          title={fx ? "Couper les animations (pour toi uniquement)" : "Remettre les animations"}
        >
          <Sparkles className="h-3 w-3" /> Animations : {fx ? "oui" : "non"}
        </button>
      </span>
    </div>
  );
}

/** Petite décoration posée sur le logo (bonnet de Noël, citrouille…). */
export function LogoDecoration({ theme }: { theme: ThemeSetting | null }) {
  const def = theme ? themeDef(theme.key) : undefined;
  if (!def) return null;
  if (def.key === "christmas")
    return (
      <svg viewBox="0 0 64 48" className="pointer-events-none absolute -right-2 -top-3 h-7 w-9 rotate-[18deg] drop-shadow" aria-hidden>
        <path d="M6 40 C 18 8, 40 2, 54 12 C 46 16, 40 26, 38 40 Z" fill="#c8102e" />
        <rect x="2" y="36" width="42" height="10" rx="5" fill="#f5f0e6" />
        <circle cx="55" cy="13" r="6" fill="#f5f0e6" />
      </svg>
    );
  return (
    <span className="pointer-events-none absolute -right-2 -top-2 text-lg leading-none drop-shadow" aria-hidden>
      {def.emoji}
    </span>
  );
}

interface Particle {
  char: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
  sway: number;
  color?: string;
  top: number;
}

/** Animation légère par-dessus la page (ne capte aucun clic). Coupée si l'utilisateur réduit les animations. */
export function ThemeEffects({ theme }: { theme: ThemeSetting }) {
  const def = themeDef(theme.key);
  const particles = useMemo(() => (def ? makeParticles(def) : []), [def]);
  if (!def) return null;
  return (
    <div className="bp-fx pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {particles.map((p, i) => {
        const style = {
          left: `${p.left}%`,
          top: def.motion === "drift" ? `${p.top}%` : undefined,
          fontSize: `${p.size}px`,
          color: p.color,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          "--bp-sway": `${p.sway}px`,
        } as CSSProperties;
        return (
          <span key={i} className={cn("bp-particle", `bp-${def.motion}`)} style={style}>
            <span className="bp-particle-inner">{p.char}</span>
          </span>
        );
      })}
    </div>
  );
}

function makeParticles(def: ThemeDef): Particle[] {
  const count = def.motion === "drift" ? 8 : def.motion === "confetti" ? 34 : 26;
  return Array.from({ length: count }, (_, i) => ({
    char: def.particles[i % def.particles.length],
    left: Math.random() * 100,
    top: 10 + Math.random() * 70,
    delay: -Math.random() * 18,
    duration: def.motion === "drift" ? 16 + Math.random() * 10 : def.motion === "confetti" ? 7 + Math.random() * 5 : 10 + Math.random() * 10,
    size: def.motion === "confetti" ? 6 + Math.random() * 6 : def.motion === "drift" ? 16 + Math.random() * 8 : 10 + Math.random() * 10,
    sway: 20 + Math.random() * 40,
    color: def.colors ? def.colors[i % def.colors.length] : undefined,
  }));
}
