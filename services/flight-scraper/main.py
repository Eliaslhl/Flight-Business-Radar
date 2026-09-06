"""
Flight scraper sidecar — isole `fast-flights` (scraping Google Flights) derrière
un contrat HTTP stable consommé par `@fbr/flight-providers` (FastFlightsProvider).

Deux modes (env `FLIGHT_SCRAPER_MODE`) :
  - "fixture" (défaut) : rejoue `fixtures/*.json` avec les dates de la requête +
    un léger jitter déterministe. Toujours fonctionnel, hors ligne.
  - "live" : tente `fast-flights`. Best-effort : tout échec renvoie
    `{ "offers": [], "degraded": true, "error": "..." }` (HTTP 200) — la chaîne
    en amont n'est jamais interrompue (cf. PHASE-0-DISCOVERY.md §25/§43).
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

MODE: Literal["fixture", "live"] = os.getenv("FLIGHT_SCRAPER_MODE", "fixture")  # type: ignore[assignment]
JITTER = float(os.getenv("FLIGHT_SCRAPER_JITTER", "0.02"))
FIXTURES_DIR = Path(__file__).parent / "fixtures"

app = FastAPI(title="fbr-flight-scraper", version="0.1.0")


class SearchRequest(BaseModel):
    origin: str
    destination: str
    outboundDate: str
    returnDate: str | None = None
    cabinClass: Literal["economy", "premium-economy", "business", "first"] = "business"
    currency: str = "EUR"
    maxStops: int = 1
    passengers: int = 1


class Leg(BaseModel):
    airlineName: str | None = None
    airlineCode: str | None = None
    flightNumbers: list[str] = Field(default_factory=list)
    departureAt: str | None = None
    arrivalAt: str | None = None
    durationMinutes: int | None = None
    stops: int = 0
    fromCode: str | None = None
    toCode: str | None = None


class Offer(BaseModel):
    priceCents: int
    currency: str
    totalStops: int = 0
    isBest: bool = False
    bookingUrl: str | None = None
    outbound: Leg
    inbound: Leg | None = None


class SearchResponse(BaseModel):
    provider: str = "fast-flights"
    mode: str = MODE
    degraded: bool = False
    currency: str = "EUR"
    fetchedAt: str
    offers: list[Offer] = Field(default_factory=list)
    error: str | None = None


# ─── helpers ────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seed_ratio(key: str) -> float:
    """Jitter déterministe par tranche de 10 min → variation réaliste et stable."""
    bucket = int(time.time() // 600)
    h = hashlib.sha1(f"{key}:{bucket}".encode()).hexdigest()
    unit = int(h[:8], 16) / 0xFFFFFFFF  # 0..1
    return 1 + (unit * 2 - 1) * JITTER


def _shift_iso(iso: str | None, base_date: str, ref_date: str) -> str | None:
    """Décale un instant ISO du delta (base_date → ref_date) en jours."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
        delta = datetime.fromisoformat(ref_date) - datetime.fromisoformat(base_date)
        return (dt + timedelta(days=delta.days)).isoformat()
    except ValueError:
        return None


def _fixture_offers(req: SearchRequest) -> list[Offer]:
    path = FIXTURES_DIR / f"{req.origin.upper()}-{req.destination.upper()}.json"
    if not path.exists():
        path = FIXTURES_DIR / "default.json"
    raw: list[dict[str, Any]] = json.loads(path.read_text())

    return_date = req.returnDate or req.outboundDate
    offers: list[Offer] = []
    for i, o in enumerate(raw):
        base_out = o["outbound"].get("_baseDate", "2026-11-10")
        base_in = (o.get("inbound") or {}).get("_baseDate", "2026-11-20")
        ratio = _seed_ratio(f"{req.origin}-{req.destination}-{i}")
        out = dict(o["outbound"])
        out["departureAt"] = _shift_iso(out.get("departureAt"), base_out, req.outboundDate)
        out["arrivalAt"] = _shift_iso(out.get("arrivalAt"), base_out, req.outboundDate)
        inb = None
        if o.get("inbound") and req.returnDate:
            inb = dict(o["inbound"])
            inb["departureAt"] = _shift_iso(inb.get("departureAt"), base_in, return_date)
            inb["arrivalAt"] = _shift_iso(inb.get("arrivalAt"), base_in, return_date)
        offer = Offer(
            priceCents=max(1, round(o["priceCents"] * ratio)),
            currency=req.currency,
            totalStops=o.get("totalStops", 0),
            isBest=o.get("isBest", i == 0),
            bookingUrl=o.get("bookingUrl"),
            outbound=Leg(**{k: v for k, v in out.items() if not k.startswith("_")}),
            inbound=Leg(**{k: v for k, v in inb.items() if not k.startswith("_")}) if inb else None,
        )
        if offer.totalStops <= req.maxStops:
            offers.append(offer)
    return offers


def _live_offers(req: SearchRequest) -> list[Offer]:
    from fast_flights import FlightQuery, Passengers, create_query, get_flights  # type: ignore

    flights = [FlightQuery(date=req.outboundDate, from_airport=req.origin, to_airport=req.destination)]
    trip = "one-way"
    if req.returnDate:
        flights.append(
            FlightQuery(date=req.returnDate, from_airport=req.destination, to_airport=req.origin)
        )
        trip = "round-trip"
    query = create_query(
        flights=flights,
        seat=req.cabinClass,
        trip=trip,  # type: ignore[arg-type]
        passengers=Passengers(adults=req.passengers),
        currency=req.currency,  # type: ignore[arg-type]
        max_stops=req.maxStops,
    )
    result = get_flights(query)
    name_to_code = {a.name.lower(): a.code for a in getattr(result.metadata, "airlines", [])}
    offers: list[Offer] = []
    for fl in getattr(result, "flights", []):
        segments = list(getattr(fl, "flights", []) or [])
        if not segments:
            continue
        first, last = segments[0], segments[-1]

        def _iso(sd: Any) -> str | None:
            try:
                y, m, d = sd.date
                hh, mm = sd.time
                return datetime(y, m, d, hh, mm, tzinfo=timezone.utc).isoformat()
            except Exception:
                return None

        airline_name = (fl.airlines or [None])[0]
        leg = Leg(
            airlineName=airline_name,
            airlineCode=name_to_code.get((airline_name or "").lower()),
            departureAt=_iso(first.departure),
            arrivalAt=_iso(last.arrival),
            durationMinutes=sum(getattr(s, "duration", 0) for s in segments) or None,
            stops=max(0, len(segments) - 1),
            fromCode=getattr(first.from_airport, "code", req.origin),
            toCode=getattr(last.to_airport, "code", req.destination),
        )
        offers.append(
            Offer(
                priceCents=int(fl.price) * 100,
                currency=req.currency,
                totalStops=leg.stops,
                outbound=leg,
            )
        )
    return offers


# ─── routes ─────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": MODE}


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    try:
        offers = _fixture_offers(req) if MODE == "fixture" else _live_offers(req)
        return SearchResponse(currency=req.currency, fetchedAt=_now_iso(), offers=offers)
    except Exception as exc:  # noqa: BLE001 — best-effort : ne jamais planter la chaîne
        return SearchResponse(
            currency=req.currency,
            fetchedAt=_now_iso(),
            degraded=True,
            offers=[],
            error=f"{type(exc).__name__}: {exc}",
        )
