"use client";

import { Loader2, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "green";

const variants: Record<Variant, string> = {
  primary: "bg-paulie-red text-cream hover:bg-paulie-red-bright border border-paulie-red-bright/40",
  green: "bg-paulie-green text-cream hover:bg-paulie-green-bright border border-paulie-green-bright/40",
  secondary: "bg-night-700 text-cream hover:bg-night-600 border border-night-500",
  ghost: "text-cream-muted hover:text-cream hover:bg-night-700",
  danger: "bg-transparent text-red-300 hover:bg-paulie-red/20 border border-paulie-red/50",
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sand",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const inputBase =
  "w-full rounded-md border border-night-500 bg-night-900 px-3 py-2 text-sm text-cream placeholder:text-cream-dim " +
  "focus:border-sand focus:outline-none focus:ring-1 focus:ring-sand disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} {...props} className={cn(inputBase, "h-10", className)} />;
});

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, "min-h-[90px]", className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputBase, "h-10 pr-8", className)}>
      {children}
    </select>
  );
}

export function Label({ children, required, htmlFor }: { children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-cream-muted">
      {children}
      {required && <span className="ml-1 text-sunset">*</span>}
    </label>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-night-500/70 bg-night-800 shadow-sign", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-night-500/70 px-5 py-3">
          <h2 className="font-display text-lg uppercase tracking-wide text-cream">{title}</h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide text-cream sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-cream-muted">{subtitle}</p>}
        <div className="mt-3 flex h-1.5 w-28 overflow-hidden rounded-full">
          <span className="flex-1 bg-paulie-red" />
          <span className="flex-1 bg-cream" />
          <span className="flex-1 bg-paulie-green" />
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-cream-muted">
      <Loader2 className="h-5 w-5 animate-spin text-sand" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-night-500 px-4 py-8 text-center text-sm text-cream-dim">{children}</p>;
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="whitespace-pre-line rounded-md border border-paulie-red/60 bg-paulie-red/15 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", className)}
      style={color ? { borderColor: `${color}99`, backgroundColor: `${color}26`, color: lighten(color) } : undefined}
    >
      {children}
    </span>
  );
}

/** Éclaircit une couleur hex pour la lisibilité sur fond sombre. */
function lighten(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[6vh] backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        className={cn("relative w-full rounded-xl border border-night-500 bg-night-800 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <header className="flex items-center justify-between border-b border-night-500 px-5 py-3">
          <h2 className="font-display text-xl uppercase tracking-wide">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-cream-muted hover:bg-night-700 hover:text-cream" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-paulie-green-bright" : "bg-night-500")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-cream transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      <span>{label}</span>
    </label>
  );
}
