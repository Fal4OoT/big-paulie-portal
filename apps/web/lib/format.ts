const TZ = "Europe/Paris";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return formatDateTime(iso);
}

/** "2001-04-12" -> "12/04/2001" */
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd || typeof ymd !== "string") return "—";
  const [y, m, d] = ymd.split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
}

export function ageFrom(ymd: string | null | undefined): number | null {
  if (!ymd || typeof ymd !== "string") return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 150 ? age : null;
}

export function formatMoney(v: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v) + " $";
}

/** 5209250963 -> (520)925-0963 (toute autre valeur est affichée telle quelle). */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return "—";
  const d = String(p).replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}` : String(p);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Instant ISO → valeur d'un champ datetime-local en heure de Paris (« 2026-11-09T21:30 »). */
export function toParisInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Prochaine demi-heure à Paris, au format datetime-local. */
export function nextHalfHourInput(): string {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setUTCMinutes(d.getUTCMinutes() < 30 ? 30 : 60, 0, 0);
  return toParisInput(d.toISOString());
}

/** Rendez-vous : « 21h30 » aujourd'hui, « demain 21h30 », sinon « 12/11 21h30 ». */
export function formatAppointment(iso: string): string {
  const v = toParisInput(iso);
  const today = toParisInput(new Date().toISOString()).slice(0, 10);
  const tomorrow = toParisInput(new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10);
  const hour = `${v.slice(11, 13)}h${v.slice(14, 16)}`;
  const day = v.slice(0, 10);
  if (day === today) return hour;
  if (day === tomorrow) return `demain ${hour}`;
  return `${day.slice(8, 10)}/${day.slice(5, 7)} ${hour}`;
}

