"use client";

import { useEffect, useState } from "react";

const ERRORS: Record<string, string> = {
  annule: "Connexion annulée.",
  session: "La session de connexion a expiré, recommence.",
  discord: "Discord n'a pas répondu correctement. Réessaie dans un instant.",
  serveur: "Ton compte Discord n'est pas membre du serveur.",
  grade: "Aucun grade du portail n'est attribué à ton compte Discord. Demande à ton patron.",
};

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [retour, setRetour] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("erreur");
    if (e) setError(ERRORS[e] ?? "Connexion impossible.");
    const r = params.get("retour");
    if (r && r.startsWith("/") && !r.startsWith("//")) setRetour(r);
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Affiche en fond, très atténuée */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.12] blur-[2px]"
        style={{ backgroundImage: "url(/affiche.jpg)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-night/40 via-night/80 to-night" aria-hidden />

      <div className="relative w-full max-w-md text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-256.png" alt="Big Paulie Budget Cars" className="mx-auto h-44 w-44 drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]" />

        <div className="mt-6 rounded-xl border border-night-500 bg-night-800/90 p-6 shadow-sign backdrop-blur">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-sand">Portail logistique</p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-wide">Espace employés</h1>
          <p className="mt-3 text-sm text-cream-muted">
            Connecte-toi avec ton compte Discord. Ton accès dépend de ton grade sur le serveur.
          </p>

          {error && (
            <div className="mt-4 rounded-md border border-paulie-red/60 bg-paulie-red/15 px-4 py-3 text-sm text-red-200">{error}</div>
          )}

          <a
            href={`/api/auth/login?returnUrl=${encodeURIComponent(retour)}`}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-md bg-[#5865F2] font-semibold text-white transition-colors hover:bg-[#4752C4]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Se connecter avec Discord
          </a>
        </div>

        <p className="mt-6 text-xs uppercase tracking-[0.25em] text-cream-dim">Sandy Shores · Terrestre · Maritime · Aérien</p>
      </div>
    </main>
  );
}
