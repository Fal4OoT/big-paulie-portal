"use client";

import { createContext, useContext } from "react";
import type { GiftTier, Me, PortalConfig, StatusCode, StatusSetting } from "./types";

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

/** Palier de cadeau pour un prix : celui au minimum le plus élevé atteint (même règle que l'API). */
export function giftFor(config: PortalConfig, price: number): GiftTier | null {
  if (!config.giftsEnabled) return null;
  let best: GiftTier | null = null;
  for (const t of config.giftTiers) {
    const matches = price >= t.min && (t.max == null || price <= t.max);
    // À minimum égal, le dernier palier de la liste l'emporte (comme côté API).
    if (matches && (best === null || t.min >= best.min)) best = t;
  }
  return best;
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
  couponsCreate: "coupons.create",
  couponsCancel: "coupons.cancel",
  referralsManage: "referrals.manage",
  tourView: "tour.view",
  statsView: "stats.view",
  partnersView: "partners.view",
  partnersCancel: "partners.cancel",
  partnerSpace: "partner.space",
  partnerValidate: "partner.validate",
  trainingView: "training.view",
  trainingManage: "training.manage",
  logsView: "logs.view",
  configManage: "config.manage",
} as const;
