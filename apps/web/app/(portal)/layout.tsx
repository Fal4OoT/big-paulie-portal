"use client";

import { BarChart3, Car, ClipboardList, LayoutDashboard, LogOut, Menu, ScrollText, Settings, Sparkles, Truck, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { CURRENT_VERSION, SEEN_VERSION_KEY } from "@/lib/changelog";
import { cn } from "@/lib/format";
import { PERM, PortalContext } from "@/lib/portal-context";
import type { Me, PortalConfig } from "@/lib/types";

const NAV = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard, perm: PERM.salesView },
  { href: "/tournee", label: "Tournée", icon: Truck, perm: PERM.tourView },
  { href: "/ventes", label: "Ventes", icon: Car, perm: PERM.salesView },
  { href: "/clients", label: "Clients", icon: Users, perm: PERM.clientsView },
  { href: "/analyse", label: "Analyse", icon: BarChart3, perm: PERM.statsView },
  { href: "/logs", label: "Logs", icon: ScrollText, perm: PERM.logsView },
  { href: "/configuration", label: "Configuration", icon: Settings, perm: PERM.configManage },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);

  // Point « nouveau » tant que la version actuelle n'a pas été consultée.
  useEffect(() => {
    const check = () => {
      try {
        setUnseen(localStorage.getItem(SEEN_VERSION_KEY) !== CURRENT_VERSION);
      } catch {
        setUnseen(false);
      }
    };
    check();
    window.addEventListener("bp:seen-version", check);
    return () => window.removeEventListener("bp:seen-version", check);
  }, []);

  const reloadConfig = useCallback(async () => {
    setConfig(await api.get<PortalConfig>("/api/config"));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.get<Me>("/api/me");
        setMe(m);
        await reloadConfig();
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          window.location.href = `/login?retour=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setFatal(e instanceof Error ? e.message : "Erreur de chargement.");
      }
    })();
  }, [reloadConfig]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (fatal) {
    return <div className="p-10 text-center text-red-300">{fatal}</div>;
  }
  if (!me || !config) return <Spinner label="Ouverture du portail…" />;

  const can = (p: string) => me.isAdmin || me.permissions.includes(p);
  const nav = NAV.filter((n) => can(n.perm));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const topGrade = me.grades[0]?.name ?? (me.isAdmin ? "Administrateur" : "");

  async function logout() {
    await api.post("/api/auth/logout").catch(() => undefined);
    window.location.href = "/login";
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-3 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-256.png" alt="" className="h-12 w-12" />
        <div className="leading-tight">
          <div className="font-display text-xl uppercase tracking-wide">Big Paulie</div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-sand">Logistique</div>
        </div>
      </Link>
      <div className="mx-5 mb-4 flex h-1 overflow-hidden rounded-full">
        <span className="flex-1 bg-paulie-red" />
        <span className="flex-1 bg-paulie-green" />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-paulie-red/90 text-cream shadow-[inset_3px_0_0_#D9A441]"
                : "text-cream-muted hover:bg-night-700 hover:text-cream",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/nouveautes"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            pathname.startsWith("/nouveautes") ? "bg-night-700 text-cream" : "text-cream-muted hover:bg-night-700 hover:text-cream",
          )}
        >
          <Sparkles className="h-4 w-4" />
          Nouveautés
          <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-cream-dim">
            {unseen && <span className="h-2 w-2 rounded-full bg-sunset" aria-label="Nouvelle version" />}v{CURRENT_VERSION}
          </span>
        </Link>
      </div>

      <div className="border-t border-night-500/70 p-4">
        <div className="flex items-center gap-3">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-night-600 font-display">{me.name[0]}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{me.name}</div>
            <div className="truncate text-xs text-cream-dim">{topGrade}</div>
          </div>
          <button onClick={logout} title="Se déconnecter" className="rounded p-2 text-cream-dim hover:bg-night-700 hover:text-cream">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <PortalContext.Provider value={{ me, config, reloadConfig }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-night-500/70 bg-night-900/80 lg:block">{sidebar}</aside>

        {/* Mobile */}
        <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-night-500/70 bg-night-900/95 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2 font-display text-lg uppercase tracking-wide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.png" alt="" className="h-8 w-8" /> Big Paulie
          </Link>
          <button onClick={() => setMenuOpen(true)} className="rounded p-2 hover:bg-night-700" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-night-500 bg-night-900">
              <button onClick={() => setMenuOpen(false)} className="absolute right-3 top-5 rounded p-1 hover:bg-night-700" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 pb-16 pt-20 sm:px-8 lg:pt-10">
          <div className="mx-auto max-w-7xl">
            {nav.length === 0 ? (
              <div className="flex items-center gap-2 text-cream-muted">
                <ClipboardList className="h-4 w-4" /> Aucun accès configuré pour ton grade.
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </PortalContext.Provider>
  );
}
