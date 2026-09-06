const eur0 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** Centimes EUR → chaîne « 1 486 € ». `null` → « — ». */
export const formatEur = (cents: number | null | undefined, decimals = false): string => {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  return (decimals ? eur2 : eur0).format(cents / 100);
};

/** Fraction → « -16 % » (signe conservé). */
export const formatPct = (fraction: number | null | undefined, digits = 0): string => {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return "—";
  return `${fraction >= 0 ? "+" : ""}${(fraction * 100).toFixed(digits)} %`;
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateShortFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string | null | undefined, short = false): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (short ? dateShortFmt : dateFmt).format(d);
};

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : timeFmt.format(d);
};

/** Durée relative compacte : « il y a 3 min », « dans 2 h ». */
export const relativeTime = (iso: string | null | undefined, now: Date = new Date()): string => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.round((t - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto", style: "short" });
  if (abs < 60) return rtf.format(Math.round(diffSec / 1), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86_400), "day");
};

export const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;

export const formatMonthKey = (key: string): string => {
  const [year, month] = key.split("-");
  const idx = Number(month) - 1;
  const names = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  return idx >= 0 && idx < 12 ? `${names[idx]} ${year}` : key;
};
