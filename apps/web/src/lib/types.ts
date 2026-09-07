/** Types DTO miroir de l'API `@fbr/api` (couplage volontairement lâche via HTTP). */

export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
export type SearchStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type SearchPriority = "HIGH" | "MEDIUM" | "LOW";
export type Availability = "AVAILABLE" | "LOW" | "WAITLIST" | "UNKNOWN";
export type PriceEventType =
  "DROP" | "FLASH_DROP" | "RISE" | "RECORD_LOW" | "RECORD_HIGH" | "TARGET_HIT" | "UNUSUAL";
export type AlertType =
  "TARGET_PRICE" | "PRICE_DROP" | "FLASH_DROP" | "RECORD_LOW" | "UNUSUAL_PRICE";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "SUPPRESSED";

export interface Search {
  id: string;
  label: string | null;
  origin: string;
  destinations: string[];
  cabinClass: CabinClass;
  departureWindow: { start: string; end: string };
  tripDuration: { minDays: number; maxDays: number };
  maxStops: number;
  maxPriceCents: number | null;
  targetPriceCents: number | null;
  currency: string;
  preferredAirlines: string[];
  excludedAirlines: string[];
  status: SearchStatus;
  priority: SearchPriority;
  intervalSeconds: number;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
  dateCombinations?: number;
}

export interface SearchFlight {
  fingerprint: string;
  origin: string;
  destination: string;
  cabinClass: CabinClass;
  outboundDate: string;
  returnDate: string | null;
  tripDays: number | null;
  marketingAirline: string | null;
  maxStops: number;
  latestPriceCents: number;
  currency: string;
  availability: Availability;
  observedAt: string;
}

export interface PriceSnapshot {
  id: number;
  flightOfferId: string;
  provider: string;
  priceCents: number;
  priceEurCents: number | null;
  currency: string;
  availability: Availability;
  status: "OBSERVED" | "CONFIRMED" | "EXPIRED" | "REJECTED";
  observedAt: string;
}

export interface PriceEvent {
  id: string;
  flightOfferId: string;
  type: PriceEventType;
  previousPriceEurCents: number | null;
  newPriceEurCents: number;
  dropAmountEurCents: number | null;
  dropPct: number | null;
  confirmed: boolean;
  detectedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
}

export interface Notification {
  id: string;
  alertId: string | null;
  priceEventId: string | null;
  channel: string;
  status: NotificationStatus;
  subject: string;
  body: string;
  dedupeKey: string;
  createdAt: string;
  sentAt: string | null;
  error: string | null;
}

export interface Alert {
  id: string;
  searchId: string;
  type: AlertType;
  thresholdEurCents: number | null;
  enabled: boolean;
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface Summary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  stdDev: number;
  coefficientOfVariation: number;
}

export interface Trend {
  slopePerDay: number;
  direction: "RISING" | "FALLING" | "STABLE";
  changePct: number;
  points: number;
  r2: number;
}

export interface GroupStat<K> {
  key: K;
  summary: Summary;
  reliable: boolean;
}

export interface AnalyticsReport {
  currency: "EUR";
  sampleSize: number;
  reliable: boolean;
  summary: Summary | null;
  trend: Trend | null;
  best: { priceEurCents: number; observedAt: string } | null;
  latest: { priceEurCents: number; observedAt: string } | null;
  byMonth: GroupStat<string>[];
  byDayOfWeek: GroupStat<number>[];
  byTripDuration: GroupStat<number>[];
  byAirline: GroupStat<string>[];
  byStops: GroupStat<number>[];
  bestMonth: { key: string; meanEurCents: number; reliable: boolean } | null;
}

export interface Health {
  status: "ok" | "degraded";
  service: string;
  version: string;
  uptimeSeconds: number;
  checks: { database: "ok" | "error" | "skipped" };
}

export interface NotificationChannelsStatus {
  channels: { name: string; configured: boolean }[];
  timeoutMs: number;
  maxAttempts: number;
}

export interface CreateSearchInput {
  label?: string;
  origin: string;
  destinations: string[];
  cabinClass?: CabinClass;
  departureWindow: { start: string; end: string };
  tripDuration: { minDays: number; maxDays: number };
  maxStops?: number;
  maxPriceCents?: number;
  targetPriceCents?: number;
  currency?: string;
}

export interface CreateAlertInput {
  searchId: string;
  type: AlertType;
  thresholdEurCents?: number;
  cooldownSeconds?: number;
}
