// Thèmes de fête du portail : définitions, dates et thème actif (heure de Paris).

import type { ThemeSetting } from "./types";

export type ThemeKey = "christmas" | "newyear" | "valentine" | "easter" | "halloween";

export interface ThemeDef {
  key: ThemeKey;
  label: string;
  emoji: string;
  defaultMessage: string;
  /** Dégradé du bandeau. */
  gradient: string;
  /** Particules animées (caractères tirés au hasard) et leur mouvement. */
  particles: string[];
  motion: "fall" | "confetti" | "drift";
  /** Couleurs des confettis (motion = confetti). */
  colors?: string[];
}

export const THEMES: ThemeDef[] = [
  {
    key: "christmas",
    label: "Noël",
    emoji: "🎄",
    defaultMessage: "Joyeuses fêtes de la part de toute l'équipe du Big Paulie !",
    gradient: "linear-gradient(90deg, #9E1B1E 0%, #6d1416 45%, #1F5A3A 100%)",
    particles: ["❄", "❅", "❆", "•"],
    motion: "fall",
  },
  {
    key: "newyear",
    label: "Nouvel An",
    emoji: "🎆",
    defaultMessage: "Bonne année ! Le Big Paulie vous souhaite le meilleur pour cette nouvelle année.",
    gradient: "linear-gradient(90deg, #2a1f14 0%, #8a6420 50%, #D9A441 100%)",
    particles: ["■", "▬", "●"],
    motion: "confetti",
    colors: ["#D9A441", "#f1e6cf", "#E07A2F", "#9E1B1E", "#2F7D53"],
  },
  {
    key: "valentine",
    label: "Saint-Valentin",
    emoji: "💘",
    defaultMessage: "Bonne Saint-Valentin ! Offrez-lui la voiture de ses rêves.",
    gradient: "linear-gradient(90deg, #9E1B1E 0%, #be185d 60%, #f472b6 100%)",
    particles: ["❤", "♥", "💕"],
    motion: "fall",
  },
  {
    key: "easter",
    label: "Pâques",
    emoji: "🐣",
    defaultMessage: "Joyeuses Pâques de la part de toute l'équipe du Big Paulie !",
    gradient: "linear-gradient(90deg, #1F5A3A 0%, #5f8a4a 50%, #D9A441 100%)",
    particles: ["🥚", "🌼", "🐣"],
    motion: "fall",
  },
  {
    key: "halloween",
    label: "Halloween",
    emoji: "🎃",
    defaultMessage: "Joyeux Halloween ! Des affaires à faire peur au Big Paulie.",
    gradient: "linear-gradient(90deg, #E07A2F 0%, #7c2d12 50%, #3b0764 100%)",
    particles: ["🦇", "🍂", "🦇"],
    motion: "drift",
  },
];

export const themeDef = (key: string) => THEMES.find((t) => t.key === key);

export const PREVIEW_KEY = "bp.themePreview";
export const FX_KEY = "bp.themeFx";
export const THEME_EVENT = "bp:theme";

/** Date du jour à Paris (AAAA-MM-JJ). */
export function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Période du thème qui contient ou suit la date donnée : [début, fin] en AAAA-MM-JJ. */
export function themePeriod(t: ThemeSetting, today: string): [string, string] | null {
  const year = Number(today.slice(0, 4));
  if (t.key === "easter") {
    for (const y of [year, year + 1]) {
      const sunday = easterSunday(y);
      const range: [string, string] = [addDays(sunday, -(t.daysBefore ?? 0)), addDays(sunday, t.daysAfter ?? 0)];
      if (range[1] >= today) return range;
    }
    return null;
  }
  if (!t.start || !t.end) return null;
  // La période peut passer d'une année à l'autre (27/12 → 02/01) : on essaie celle qui a commencé l'an dernier.
  for (const y of [year - 1, year, year + 1]) {
    const start = `${y}-${t.start}`;
    const end = t.end >= t.start ? `${y}-${t.end}` : `${y + 1}-${t.end}`;
    if (end >= today) return [start, end];
  }
  return null;
}

/** Premier thème activé dont la période contient aujourd'hui. */
export function activeTheme(themes: ThemeSetting[], today = todayParis()): ThemeSetting | null {
  for (const t of themes) {
    if (!t.enabled) continue;
    const p = themePeriod(t, today);
    if (p && p[0] <= today && today <= p[1]) return t;
  }
  return null;
}
