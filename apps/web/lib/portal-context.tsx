"use client";

import { createContext, useContext } from "react";
import type { Me, PortalConfig, StatusCode, StatusSetting } from "./types";

export interface PortalContextValue {
  me: Me;
  config: PortalConfig;
  reloadConfig: () => Promise<void>;
}

export const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal hors du layout du portail");
  return ctx;
}

/** Vérifie une permission de l'utilisateur connecté. */
export function useCan() {
  const { me } = usePortal();
  return (perm: string) => me.isAdmin || me.permissions.includes(perm);
}

export function useStatus() {
  const { config } = usePortal();
  return (code: StatusCode): StatusSetting =>
    config.statuses.find((s) => s.code === code) ?? { code, label: code, color: "#888888" };
}

export const PERM = {
  clientsView: "clients.view",
  clientsCreate: "clients.create",
  clientsEdit: "clients.edit",
  clientsDelete: "clients.delete",
  salesView: "sales.view",
  salesCreate: "sales.create",
  salesAdvance: "sales.advance",
  salesRevert: "sales.revert",
  salesEdit: "sales.edit",
  salesCancel: "sales.cancel",
  tourView: "tour.view",
  statsView: "stats.view",
  logsView: "logs.view",
  configManage: "config.manage",
} as const;
