import type {
  Alert,
  AnalyticsReport,
  CreateAlertInput,
  CreateSearchInput,
  Health,
  Notification,
  NotificationChannelsStatus,
  PriceEvent,
  PriceSnapshot,
  Search,
  SearchFlight,
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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
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

  listSearches: () => request<{ searches: Search[] }>("/api/searches").then((r) => r.searches),
  getSearch: (id: string) => request<Search>(`/api/searches/${id}`),
  createSearch: (body: CreateSearchInput) =>
    request<Search>("/api/searches", { method: "POST", body: JSON.stringify(body) }),
  deleteSearch: (id: string) => request<void>(`/api/searches/${id}`, { method: "DELETE" }),
  activateSearch: (id: string) => post(`/api/searches/${id}/activate`) as Promise<Search>,
  pauseSearch: (id: string) => post(`/api/searches/${id}/pause`) as Promise<Search>,
  runSearch: (id: string) => post(`/api/searches/${id}/run`) as Promise<{ jobId: string }>,

  flights: (id: string) =>
    request<{ flights: SearchFlight[] }>(`/api/searches/${id}/flights`).then((r) => r.flights),
  prices: (id: string, limit = 1000) =>
    request<{ prices: PriceSnapshot[] }>(`/api/searches/${id}/prices?limit=${String(limit)}`).then(
      (r) => r.prices,
    ),
  analytics: (id: string) => request<AnalyticsReport>(`/api/searches/${id}/analytics`),
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
