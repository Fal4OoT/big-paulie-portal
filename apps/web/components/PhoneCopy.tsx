"use client";

import { Check, Phone } from "lucide-react";
import { useState } from "react";
import { cn, formatPhone } from "@/lib/format";

/** Numéro du client : clic = copie des 10 chiffres (à composer en jeu). */
export function PhoneCopy({ phone, className }: { phone: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const digits = phone.replace(/\D/g, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(digits || phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* presse-papiers indisponible : le numéro reste lisible */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copier le numéro"
      className={cn("inline-flex items-center gap-1 text-xs tabular-nums text-cream transition-colors hover:text-sand", className)}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Phone className="h-3 w-3 text-cream-dim" />}
      {formatPhone(phone)}
      {copied && <span className="text-emerald-300">copié</span>}
    </button>
  );
}
