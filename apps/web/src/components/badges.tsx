import { Badge } from "./ui";
import type { AlertType, PriceEventType, SearchPriority, SearchStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: SearchStatus }) {
  const map = {
    ACTIVE: { tone: "ok", label: "Active" },
    PAUSED: { tone: "warn", label: "En pause" },
    ARCHIVED: { tone: "neutral", label: "Archivée" },
  } as const;
  const s = map[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: SearchPriority }) {
  const map = {
    HIGH: { tone: "danger", label: "Priorité haute" },
    MEDIUM: { tone: "accent", label: "Priorité moyenne" },
    LOW: { tone: "neutral", label: "Priorité basse" },
  } as const;
  const p = map[priority];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

const EVENT_LABELS: Record<
  PriceEventType,
  { tone: "ok" | "warn" | "danger" | "accent" | "neutral"; label: string }
> = {
  FLASH_DROP: { tone: "danger", label: "🚨 Baisse flash" },
  DROP: { tone: "ok", label: "📉 Baisse" },
  RECORD_LOW: { tone: "ok", label: "🏆 Record bas" },
  TARGET_HIT: { tone: "accent", label: "🎯 Cible atteinte" },
  UNUSUAL: { tone: "accent", label: "✨ Inhabituel" },
  RISE: { tone: "warn", label: "📈 Hausse" },
  RECORD_HIGH: { tone: "warn", label: "📈 Record haut" },
};

export function EventBadge({ type }: { type: PriceEventType }) {
  const e = EVENT_LABELS[type];
  return <Badge tone={e.tone}>{e.label}</Badge>;
}

const ALERT_LABELS: Record<AlertType, string> = {
  TARGET_PRICE: "Prix cible",
  PRICE_DROP: "Baisse",
  FLASH_DROP: "Baisse flash",
  RECORD_LOW: "Record bas",
  UNUSUAL_PRICE: "Prix inhabituel",
};

export const alertTypeLabel = (t: AlertType): string => ALERT_LABELS[t];
