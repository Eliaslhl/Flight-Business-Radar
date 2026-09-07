import type {
  Alert,
  AnalyticsReport,
  AuthUser,
  CreateAlertInput,
  CreateSearchInput,
  Advice,
  Health,
  MeResponse,
  Notification,
  NotificationChannelsStatus,
  RecommendationReport,
  SeedAirport,
  WorldAirport,
  PriceEvent,
  PriceSnapshot,
  Search,
  SearchFlight,
  SearchPriority,
  UpdateSearchInput,
} from "./types";

/** Base vide ⇒ même origine : les rewrites Next proxy `/api/*` et `/health` vers l'API Fastify. */
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: unknown,
  ) {
    super(`API ${String(status)} ${path}`);
    this.name = "ApiError";
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  // `content-type: application/json` uniquement quand il y a un corps — sinon
  // Fastify rejette un POST « vide » (logout, activate/pause/run…) en 400.
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body != null ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, path, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};

const post = (path: string, body?: unknown): Promise<unknown> =>
  request(path, { method: "POST", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

export const api = {
  health: () => request<Health>("/health"),
  notificationChannels: () => request<NotificationChannelsStatus>("/api/notifications/channels"),

  me: () => request<MeResponse>("/api/auth/me"),
  register: (email: string, password: string) =>
    request<{ user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  listSearches: () => request<{ searches: Search[] }>("/api/searches").then((r) => r.searches),
  getSearch: (id: string) => request<Search>(`/api/searches/${id}`),
  createSearch: (body: CreateSearchInput) =>
    request<Search>("/api/searches", { method: "POST", body: JSON.stringify(body) }),
  updateSearch: (id: string, body: UpdateSearchInput) =>
    request<Search>(`/api/searches/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSearch: (id: string) => request<void>(`/api/searches/${id}`, { method: "DELETE" }),
  activateSearch: (id: string) => post(`/api/searches/${id}/activate`) as Promise<Search>,
  pauseSearch: (id: string) => post(`/api/searches/${id}/pause`) as Promise<Search>,
  runSearch: (id: string) =>
    post(`/api/searches/${id}/run`) as Promise<{
      enqueued: boolean;
      jobId?: string;
      scheduled?: boolean;
    }>,
  setPriority: (id: string, priority: SearchPriority) =>
    post(`/api/searches/${id}/priority`, { priority }) as Promise<Search>,

  flights: (id: string) =>
    request<{ flights: SearchFlight[] }>(`/api/searches/${id}/flights`).then((r) => r.flights),
  prices: (id: string, limit = 1000) =>
    request<{ prices: PriceSnapshot[] }>(`/api/searches/${id}/prices?limit=${String(limit)}`).then(
      (r) => r.prices,
    ),
  analytics: (id: string) => request<AnalyticsReport>(`/api/searches/${id}/analytics`),
  recommendations: (id: string) =>
    request<RecommendationReport>(`/api/searches/${id}/recommendations`),
  advice: (id: string) => request<Advice>(`/api/searches/${id}/advice`),
  radarDestinations: () =>
    request<{ origin: string; count: number; destinations: SeedAirport[] }>(
      "/api/radar/destinations",
    ),
  airports: () =>
    request<{ count: number; airports: WorldAirport[] }>("/api/airports").then((r) => r.airports),
  events: (id: string) =>
    request<{ events: PriceEvent[] }>(`/api/searches/${id}/events`).then((r) => r.events),
  notifications: (id: string) =>
    request<{ notifications: Notification[] }>(`/api/searches/${id}/notifications`).then(
      (r) => r.notifications,
    ),

  listAlerts: (searchId?: string) =>
    request<{ alerts: Alert[] }>(`/api/alerts${searchId ? `?searchId=${searchId}` : ""}`).then(
      (r) => r.alerts,
    ),
  createAlert: (body: CreateAlertInput) =>
    request<Alert>("/api/alerts", { method: "POST", body: JSON.stringify(body) }),
  deleteAlert: (id: string) => request<void>(`/api/alerts/${id}`, { method: "DELETE" }),
  enableAlert: (id: string) => post(`/api/alerts/${id}/enable`) as Promise<Alert>,
  disableAlert: (id: string) => post(`/api/alerts/${id}/disable`) as Promise<Alert>,
};
