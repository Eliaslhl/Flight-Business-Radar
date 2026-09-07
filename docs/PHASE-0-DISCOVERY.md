# Phase 0 — Discovery & Architecture Report

**Projet :** Flight Business Radar (nom provisoire)
**Date :** 2026-09-06
**Statut :** Analyse préalable — aucun code applicatif écrit.

---

## 1. État actuel du repository

| Élément    | Constat                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| Chemin     | `/Users/elias/Documents/projet/Flight-Business-Radar`                            |
| Git        | Repository initialisé, branche `main`, **0 commit**                              |
| Remote     | `origin` → `https://github.com/Eliaslhl/Flight-Business-Radar.git`               |
| Contenu    | **Vide** (uniquement `.git/`) — aucun `package.json`, aucune stack pré-existante |
| Node       | v24.9.0                                                                          |
| npm        | 11.6.0                                                                           |
| pnpm       | **absent** (à activer via `corepack enable`)                                     |
| Docker     | 29.3.1 (OK)                                                                      |
| PostgreSQL | client `psql` 18.3 présent (serveur à confirmer / conteneuriser)                 |
| Redis      | `redis-cli` **absent** (à fournir via Docker)                                    |

**Conclusion :** projet greenfield total. Aucune contrainte de code legacy. Toute la stack est à définir.
Contraintes machine : pas de pnpm ni Redis installés → à provisionner (corepack + docker-compose).

---

## 2. Recherche des sources de données aériennes (Business Class, CDG)

> Règle appliquée : aucune hypothèse. Chaque source ci-dessous a été vérifiée (septembre 2026).

### 2.1 Résultat majeur

**Amadeus for Developers – Self-Service API est DÉCOMMISSIONNÉ depuis le 2026-07-17.**
Le portail self-service a été fermé, les clés API désactivées, les inscriptions suspendues depuis le printemps 2026. Seul l'accès **Amadeus Enterprise (AQC)** subsiste — il nécessite un **contrat commercial** et un compte géré. C'était historiquement LA solution gratuite, documentée et officielle. **Elle n'est plus disponible.**

### 2.2 Fiches providers

#### Provider — Amadeus Self-Service

| Champ                        | Valeur                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| Type                         | Agrégateur GDS, API REST officielle                                  |
| API officielle               | Oui — mais **portail fermé le 2026-07-17**                           |
| Open source                  | Non                                                                  |
| Business Class               | Oui (`travelClass=BUSINESS`)                                         |
| Prix / Dispo                 | Oui (Flight Offers Search / Price)                                   |
| Recherche par plage de dates | Non nativement (1 couple de dates par appel)                         |
| Rate limits                  | Historiquement ~10 req/s, quota mensuel free                         |
| Coût                         | Free tier (n'existe plus)                                            |
| CGU                          | Interdiction de stockage long terme des prix dans l'ancienne version |
| Fiabilité                    | Élevée (quand actif)                                                 |
| **Risque**                   | **Rédhibitoire — service arrêté. Enterprise = contrat.**             |

#### Provider — Duffel

| Champ                    | Valeur                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type                     | Agrégateur NDC/GDS officiel, API REST                                                                                                                                                                 |
| API officielle           | Oui, très bien documentée, SDK Node/Python/Ruby                                                                                                                                                       |
| Open source              | SDK oui, données non                                                                                                                                                                                  |
| Business Class           | Oui (`cabin_class=business`)                                                                                                                                                                          |
| Prix / Dispo             | Oui, contenu réel réservable en production                                                                                                                                                            |
| Recherche plage de dates | Non nativement (un `offer_request` = dates fixes)                                                                                                                                                     |
| Rate limits              | Généreux ; **sandbox illimité mais données factices** (« Duffel Airways »)                                                                                                                            |
| Coût                     | $3 / commande confirmée + **frais de recherche $0,005/recherche au-delà d'un ratio recherche:réservation de 1500:1**                                                                                  |
| CGU                      | Passage en production = vérification d'identité + acceptation des CGU commerciales                                                                                                                    |
| Fiabilité                | Élevée                                                                                                                                                                                                |
| **Risque**               | **Modèle tarifaire orienté réservation.** Un radar qui ne réserve jamais paie ~$0,005 par recherche. Sandbox inutilisable pour de l'historique réel. Cas d'usage « monitoring pur » peut être refusé. |

#### Provider — Kiwi.com (Tequila API)

| Champ                    | Valeur                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Type                     | Agrégateur + virtual interlining, API REST                                                                |
| API officielle           | Oui, mais **accès sur invitation uniquement depuis 2024** (canal B2B)                                     |
| Open source              | Non                                                                                                       |
| Business Class           | Filtrage cabine **historiquement faible/peu fiable** (Kiwi = optimisé économie low-cost)                  |
| Prix / Dispo             | Oui                                                                                                       |
| Recherche plage de dates | **Oui** (paramètres `date_from`/`date_to`, `nights_in_dst_from/to`) — excellent pour ce projet            |
| Rate limits              | Selon contrat partenaire                                                                                  |
| Coût                     | Commission affiliation ; accès gated                                                                      |
| CGU                      | Partenariat requis (produit voyage live exigé)                                                            |
| **Risque**               | **Accès non garanti** (invitation). Fitness Business Class discutable. À réévaluer si partenariat obtenu. |

#### Provider — SerpApi · Google Flights API

| Champ                    | Valeur                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Type                     | API officielle SerpApi qui _scrape_ Google Flights, JSON structuré typé                                                                   |
| API officielle           | Oui (produit SerpApi documenté et stable)                                                                                                 |
| Open source              | Non                                                                                                                                       |
| Business Class           | Oui (`travel_class=3`)                                                                                                                    |
| Prix / Dispo             | Prix Google Flights + `booking_options` + **`price_insights`** (bas/typique/élevé + graphe historique Google)                             |
| Recherche plage de dates | 1 couple de dates/appel, mais `outbound_date`/`return_date` + option `flexible` ; bien adapté à la génération de combinaisons côté moteur |
| Rate limits              | Free : 250 recherches/mois, 50/h · Developer $75 : 5 000/mois, 1 000/h · Production $150 : 15 000/mois, 3 000/h                           |
| Coût                     | Free 250/mois ; payant $25–$725/mois                                                                                                      |
| CGU                      | SerpApi assume la responsabilité juridique du scraping (précédent hiQ) — c'est le principal intérêt                                       |
| Fiabilité                | Bonne ; dépend de la stabilité de Google Flights (SerpApi absorbe les changements)                                                        |
| **Risque**               | **Modéré.** Coût à l'échelle ; dépendance à un tiers qui dépend de Google. Recommandé comme **1er provider réel**.                        |

#### Provider — Travelpayouts / Aviasales

| Champ                    | Valeur                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type                     | Réseau d'affiliation + API données de vol                                                                                                                                                                                   |
| API officielle           | Oui                                                                                                                                                                                                                         |
| Open source              | Non                                                                                                                                                                                                                         |
| Business Class           | Support limité                                                                                                                                                                                                              |
| Prix / Dispo             | **Data API = prix en cache agrégés, jusqu'à 7 jours d'ancienneté**, pensée pour pages statiques. API recherche temps réel = **50 000 MAU requis**. Ancienne version arrêtée le 2026-06-15. Nouvelle version : 100 req/h/IP. |
| Recherche plage de dates | Partiel (calendrier de prix par mois)                                                                                                                                                                                       |
| Coût                     | Data API gratuite                                                                                                                                                                                                           |
| **Risque**               | **Fraîcheur des données insuffisante** pour la détection de baisses flash. Utilisable seulement comme signal de fond « mois le moins cher ».                                                                                |

#### Provider — FlightAPI.io

| Champ                    | Valeur                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Type                     | Agrégateur commercial (source de données opaque, probablement scraping OTA)                                                                    |
| API officielle           | Oui (produit commercial), doc correcte                                                                                                         |
| Open source              | Non                                                                                                                                            |
| Business Class           | Oui (`cabinClass=Business`)                                                                                                                    |
| Prix / Dispo             | Oui, 700+ compagnies/OTA                                                                                                                       |
| Recherche plage de dates | Non (endpoints `oneway`/`roundtrip`/`multitrip`, dates fixes, système de crédits)                                                              |
| Coût                     | Crédits payants (roundtrip = 2 crédits), pas de vrai free tier durable                                                                         |
| **Risque**               | **Boîte noire.** Provenance des données non vérifiable, fiabilité non auditée indépendamment. Utilisable comme provider secondaire de largeur. |

#### Provider — RapidAPI « Sky Scrapper » (apiheya)

| Champ          | Valeur                                                                          |
| -------------- | ------------------------------------------------------------------------------- |
| Type           | Scraper Skyscanner **non officiel**, tiers                                      |
| API officielle | Non (l'API Skyscanner officielle est fermée aux indépendants)                   |
| Open source    | Non                                                                             |
| Business Class | Oui (`cabinClass`)                                                              |
| Prix / Dispo   | Fares équivalents Skyscanner                                                    |
| Coût           | Free tier disponible                                                            |
| CGU            | **Viole les CGU de Skyscanner**                                                 |
| Fiabilité      | **Faible** — mainteneur unique, casse à chaque changement Skyscanner, aucun SLA |
| **Risque**     | **Élevé.** À isoler derrière l'interface, jamais en dépendance dure.            |

#### Solution open source — `fast-flights` / `faster-flights` (Python)

| Champ                    | Valeur                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type                     | Scraper Google Flights open source (reverse-engineering du paramètre Protobuf `tfs` + parsing HTML), licence MIT                                 |
| Business Class           | Oui (`seat` class)                                                                                                                               |
| Prix / Dispo             | Oui (prix Google Flights)                                                                                                                        |
| Recherche plage de dates | Non (dates fixes)                                                                                                                                |
| Coût                     | Gratuit                                                                                                                                          |
| CGU                      | **Viole les CGU de Google** ; risque de blocage IP / captcha                                                                                     |
| Fiabilité                | **Faible** — fragile (casse sur changements HTML/protobuf Google), **écosystème Python** (notre stack = TS → microservice ou portage nécessaire) |
| **Risque**               | **Élevé.** Bon comme provider **dev / backfill à coût zéro** derrière l'interface, pas pour la production.                                       |

#### APIs compagnies directes (Air France-KLM, Lufthansa Group)

- Portails développeurs existants mais **offres/prix gated par accord partenaire**. Open Data (horaires) accessible, pricing non.
- Option long-tail pour Phase 7+ si un partenariat est établi. Non retenu pour le MVP.

### 2.3 Tableau de synthèse

| Provider                   | Officiel | Accessible seul   | Business Class | Fraîcheur temps réel | Plage de dates | Coût MVP         | Risque          | Rôle retenu                                                |
| -------------------------- | -------- | ----------------- | -------------- | -------------------- | -------------- | ---------------- | --------------- | ---------------------------------------------------------- |
| Amadeus Self-Service       | Oui      | **Non (fermé)**   | Oui            | —                    | Non            | —                | Rédhibitoire    | ❌ Abandonné                                               |
| Duffel                     | Oui      | Oui (vérif. prod) | Oui            | Oui (prod)           | Non            | $0,005/recherche | Moyen           | ✅ **Oracle de confirmation + lien réservation** (Phase 7) |
| Kiwi Tequila               | Oui      | Non (invitation)  | Faible         | Oui                  | **Oui**        | Gated            | Élevé (accès)   | 🔶 Si partenariat obtenu                                   |
| **SerpApi Google Flights** | Oui      | Oui               | Oui            | Oui                  | Contournable   | $0 → $150/mo     | Moyen           | ✅ **1er provider réel** (Phase 7)                         |
| Travelpayouts Data         | Oui      | Oui               | Faible         | **Non (J-7)**        | Mensuel        | Gratuit          | Faible          | 🔶 Signal « mois le moins cher »                           |
| FlightAPI.io               | Oui      | Oui               | Oui            | Oui                  | Non            | Crédits          | Moyen (opacité) | 🔶 Provider de largeur (Radar)                             |
| Sky Scrapper (RapidAPI)    | Non      | Oui               | Oui            | Oui                  | Non            | Free tier        | **Élevé**       | 🔶 Dernier recours, isolé                                  |
| `fast-flights` (OSS)       | Non      | Oui               | Oui            | Oui                  | Non            | Gratuit          | **Élevé**       | 🔶 Dev / backfill uniquement                               |
| **MockFlightProvider**     | —        | —                 | Oui            | Simulé               | Oui            | Gratuit          | Nul             | ✅ **Provider principal Phases 1–6**                       |

### 2.4 Recommandation providers

1. **Phases 1–6 :** développer **tout le moteur** contre `MockFlightProvider` (scénarios déterministes : prix normal, baisse graduelle, flash drop, erreur, timeout, indisponible, record low).
2. **Phase 7, 1er provider réel : SerpApi Google Flights** — meilleur compromis documenté / couverture juridique / Business Class / bonus `price_insights`. Budget ~$75–150/mois.
3. **Phase 7, 2nd provider : Duffel (production)** — utilisé comme **oracle de confirmation** des baisses flash (contenu GDS/NDC réellement réservable) + génération du **lien de réservation**. Les requêtes de confirmation sont peu nombreuses → frais de recherche négligeables.
4. **Optionnel : FlightAPI.io** ou microservice `fast-flights` auto-hébergé comme provider de **largeur** pour le mode Radar/Explore, marqué explicitement « confiance réduite ».
5. **Jamais de dépendance à un seul provider.** Déduplication + score de confiance inter-providers. Toute la logique de conversion/normalisation reste dans la couche provider.

---

## 3. Risques techniques et légaux

### Techniques

- **Aucune API gratuite officielle ne subsiste** post-Amadeus → le « vrai » moteur de prix a un coût (SerpApi) ou un risque (scrapers). À arbitrer (décision #4).
- **Pas de recherche native par plage de dates** chez la plupart des providers → explosion combinatoire à maîtriser côté moteur (génération + priorisation + quotas).
- **Fragilité des scrapers** : blocage IP, captcha, changements de structure. Circuit breaker + fallback obligatoires.
- **Rate limiting** : quotas stricts (SerpApi 1 000/h, Travelpayouts 100/h/IP). Limiteur centralisé par provider + token bucket Redis.
- **Faux positifs de baisse** : erreurs provider, deep-links expirés, changement d'itinéraire/durée comparé. → étape de confirmation systématique.
- **Cohérence des devises** : ne jamais mélanger EUR/USD/… dans les statistiques ; normaliser en EUR au moment de l'observation avec taux daté.
- **Volume de `price_snapshots`** : table append-only qui grossit vite → partitionnement mensuel dès le départ, index ciblés.

### Légaux / CGU

- **Scraping direct de Google Flights / Skyscanner = violation de CGU.** Mitigation : passer par **SerpApi** (transfère la responsabilité) plutôt qu'un scraper maison en production.
- **Redistribution des tarifs** : usage personnel / analytique OK ; **ne pas republier publiquement les fares bruts**, ne pas prétendre vendre des billets. Le produit est un **moteur de recherche / surveillance / recommandation** ; la réservation se fait via **deep-link provider**.
- **RGPD** : table `users` avec PII minimale, consentement explicite pour les notifications, droit à l'effacement. `price_snapshots` (non personnel) séparé.
- **Affiliation / attribution** : liens SerpApi / marqueur affilié Travelpayouts → construction des `booking_url` isolée dans la couche provider.
- **Secrets** : `.env.example` versionné, `.env` jamais commité, `.gitignore` strict dès Phase 1.

---

## 4. Architecture proposée

### 4.1 Monorepo (pnpm workspaces + Turborepo)

```
flight-business-radar/
  apps/
    web/            # Next.js (App Router) — dashboard
    api/            # Fastify — API REST (DDD, controllers fins)
    worker/         # Process BullMQ (scheduler + workers)
  packages/
    core-domain/    # entités, value objects, use-cases purs (aucune I/O)
    flight-providers/ # interface FlightProvider + Mock + SerpApi + Duffel
    normalizer/     # payload provider -> FlightOffer, validation, déduplication
    analytics/      # stats (avg/median/percentile/volatilité/trend/mensuel/jour) + OpportunityScore
    alerting/       # moteur de règles (5 types) + cooldown + confirmation
    notifications/  # NotificationService + canaux (console, email, telegram, discord)
    database/       # schéma + migrations + client typé + repositories
    scheduler/      # stratégie de fréquence adaptative + calcul de priorité
    config/         # env validé par Zod, configs providers, paramètres ajustables
    shared/         # logger (pino), erreurs, types, devises, générateur de plages de dates
  docker/           # docker-compose (postgres, redis), Dockerfiles multi-stage
  docs/             # README, ARCHITECTURE, API, DATABASE, FLIGHT_PROVIDERS, WORKERS, NOTIFICATIONS, ANALYTICS, DEVELOPMENT
```

### 4.2 Choix de stack (à valider — voir §9)

| Domaine             | Choix recommandé                                                  | Alternative                  |
| ------------------- | ----------------------------------------------------------------- | ---------------------------- |
| Langage             | TypeScript **strict** partout                                     | —                            |
| Package manager     | pnpm (via corepack)                                               | npm workspaces               |
| Orchestration build | Turborepo                                                         | Nx                           |
| Base de données     | PostgreSQL 16+                                                    | —                            |
| ORM                 | **Drizzle** (SQL-first, partitionnement/Timescale facile)         | Prisma (DX + migrations)     |
| Queue               | BullMQ sur Redis 7                                                | —                            |
| Framework API       | **Fastify** + couche use-cases                                    | NestJS / Next route handlers |
| Frontend            | Next.js + TanStack Query + Tailwind + shadcn/ui + Recharts        | —                            |
| Validation          | Zod (schémas partagés API ↔ web)                                  | —                            |
| Auth                | Auth.js (magic link) — activée en Phase 6                         | Lucia                        |
| Logs                | pino (structuré, noms d'événements normalisés)                    | —                            |
| Tests               | Vitest (unit + intégration) + Testcontainers + Playwright (E2E)   | —                            |
| Observabilité       | OpenTelemetry + endpoint Prometheus ; exporteur Datadog optionnel | —                            |
| Conteneurs          | docker-compose (pg + redis) ; Dockerfiles multi-stage             | —                            |
| CI                  | GitHub Actions : lint · typecheck · test · build                  | —                            |

### 4.3 Flux de données

```
Scheduler ──(due?)──> Queue: search ──> ProviderRegistry (Promise.allSettled)
                                          │  SerpApi / Duffel / Mock
                                          ▼
                                     Normalizer (valider, dédupliquer, upsert flight_offers)
                                          ▼
                                     price_snapshots (APPEND ONLY)
                                          ▼
                                 Queue: analyze ──> deltas + détection price_events
                                          ▼
                            Candidat baisse/flash ──> Queue: confirm (re-requête même + autre provider)
                                          ▼
                              Confirmé ──> Alerting (règles + cooldown) ──> Queue: notify
                                          ▼
                              NotificationService ──> canaux ──> table notifications
```

---

## 5. Schéma PostgreSQL (draft)

Monnaie en `numeric(10,2)` (jamais de float). Tous les timestamps en `timestamptz` (UTC). Triggers `updated_at`.

```sql
-- Référentiels (seed)
airports(iata_code PK, icao, name, city, country, lat, lon, timezone)
airlines(iata_code PK, icao, name, alliance)
fx_rates(base char(3), quote char(3), rate numeric(14,6), as_of date, source,
         UNIQUE(base, quote, as_of))

-- Utilisateurs
users(id uuid PK, email citext UNIQUE, password_hash, display_name,
      preferred_currency char(3) DEFAULT 'EUR', timezone DEFAULT 'Europe/Paris',
      created_at, updated_at)

-- Recherches sauvegardées
searches(
  id uuid PK, user_id uuid FK, label text,
  origin char(3) DEFAULT 'CDG',
  destinations text[]           -- vide/NULL => mode Radar/Explore
  cabin_class text CHECK (cabin_class IN ('ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST')),
  date_range_start date, date_range_end date,
  min_trip_days int, max_trip_days int,
  max_price numeric(10,2), target_price numeric(10,2), currency char(3) DEFAULT 'EUR',
  max_stops int DEFAULT 1,
  preferred_airlines text[], excluded_airlines text[],
  flexibility jsonb,            -- préférences jour de semaine, etc.
  status text CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')) DEFAULT 'ACTIVE',
  priority text CHECK (priority IN ('HIGH','MEDIUM','LOW')) DEFAULT 'MEDIUM',
  monitoring jsonb,             -- { tier, interval_seconds, next_run_at, last_run_at }
  created_at, updated_at
)

-- Combinaisons de dates (matérialisées + priorisées)
search_date_combinations(
  id uuid PK, search_id uuid FK,
  outbound_date date, return_date date, trip_days int,
  priority_score numeric, last_checked_at timestamptz, enabled bool DEFAULT true,
  UNIQUE(search_id, outbound_date, return_date)
)

-- Identité normalisée d'une offre (cible de déduplication)
flight_offers(
  id uuid PK,
  fingerprint text UNIQUE,      -- hash(origin|dest|out_date|ret_date|airline|flight_numbers|cabin)
  origin char(3), destination char(3),
  outbound_date date, return_date date,   -- return_date NULL => aller simple
  marketing_airline char(3), operating_airline char(3), flight_numbers text[],
  cabin_class text, fare_brand text,
  outbound_stops int, return_stops int,
  outbound_duration_min int, return_duration_min int,
  outbound_departure_at timestamptz, outbound_arrival_at timestamptz,
  first_seen_at, last_seen_at
)

-- Une même offre vue par plusieurs providers
offer_provider_links(
  id uuid PK, flight_offer_id uuid FK, provider text,
  provider_offer_id text, booking_url text, deep_link_expires_at timestamptz,
  last_seen_at timestamptz,
  UNIQUE(flight_offer_id, provider)
)

-- LE COEUR : append-only, jamais d'UPDATE/DELETE
price_snapshots(
  id bigint IDENTITY PK,
  flight_offer_id uuid FK,
  search_id uuid FK,           -- NULL possible
  provider text,
  price numeric(10,2), currency char(3),
  price_eur numeric(10,2),     -- normalisé pour les stats
  fx_rate numeric(14,6), fx_source text,
  availability text CHECK (availability IN ('AVAILABLE','LOW','WAITLIST','UNKNOWN')),
  seats_remaining int,
  status text CHECK (status IN ('OBSERVED','CONFIRMED','EXPIRED','REJECTED')) DEFAULT 'OBSERVED',
  observed_at timestamptz DEFAULT now()
)
-- INDEX (flight_offer_id, observed_at DESC), (search_id, observed_at DESC)
-- PARTITION BY RANGE (observed_at) -- mensuel dès le départ

-- Variations détectées (dérivées)
price_events(
  id uuid PK, flight_offer_id uuid FK, search_id uuid FK,
  type text CHECK (type IN ('DROP','FLASH_DROP','RISE','RECORD_LOW','RECORD_HIGH','TARGET_HIT','UNUSUAL')),
  previous_price_eur numeric(10,2), new_price_eur numeric(10,2),
  drop_amount_eur numeric(10,2), drop_pct numeric(6,4),
  previous_snapshot_id bigint, new_snapshot_id bigint,
  confirmed bool DEFAULT false, confirmation_snapshot_id bigint,
  detected_at timestamptz, resolved_at timestamptz, duration_seconds int
)

-- Config d'alertes utilisateur
alerts(
  id uuid PK, user_id uuid FK, search_id uuid FK,
  type text CHECK (type IN ('TARGET_PRICE','PRICE_DROP','FLASH_DROP','RECORD_LOW','UNUSUAL_PRICE')),
  threshold numeric(10,2), params jsonb,
  enabled bool DEFAULT true, cooldown_seconds int DEFAULT 3600,
  last_triggered_at timestamptz, created_at
)

-- Historique / outbox des notifications
notifications(
  id uuid PK, user_id uuid FK, alert_id uuid, price_event_id uuid,
  channel text CHECK (channel IN ('CONSOLE','EMAIL','TELEGRAM','DISCORD','PUSH')),
  status text CHECK (status IN ('PENDING','SENT','FAILED','SUPPRESSED')) DEFAULT 'PENDING',
  subject text, body text, payload jsonb,
  dedupe_key text UNIQUE,      -- anti-spam : hash(user|event|jour)
  created_at, sent_at, error text
)

-- Observabilité / audit des appels providers
provider_requests(
  id bigint IDENTITY PK, provider text, search_id uuid,
  endpoint text, request_params jsonb, http_status int,
  latency_ms int, result_count int, error text, cost_units numeric(10,4),
  created_at timestamptz DEFAULT now()
)
```

**Règles data quality (rejet du snapshot) :** prix absent · devise inconnue · destination incohérente · dates incohérentes · Business Class non confirmée · provider en erreur · prix hors bande plausible (ex. < 150 € ou > 20 000 € pour un long-courrier business CDG).

**Déduplication (`fingerprint`) :** `origin | destination | outbound_date | return_date | marketing_airline | flight_numbers | cabin`. Stratégie robuste aux champs manquants : si `flight_numbers` absent → fallback sur `(airline, heures de départ/arrivée arrondies, escales)`.

---

## 6. Architecture des workers

| Process                       | Rôle                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`apps/api`**                | Stateless. CRUD, lectures, endpoint « run now » (enqueue). Aucune logique métier lourde.                                                                                                                                             |
| **Scheduler** (leader unique) | Job répétable BullMQ (~30–60 s) : scanne `searches` ACTIVE, sélectionne les recherches dues (`monitoring.next_run_at`), enqueue `search.run` avec priorité. Après chaque run : recalcule priorité + prochain intervalle (adaptatif). |
| **Queue `search`**            | 1 job = (searchId, lot de combinaisons de dates). Concurrence N. **Rate-limit par provider** (limiter BullMQ + token bucket Redis partagé).                                                                                          |
| **Queue `analyze`**           | Après écriture des snapshots : calcule les deltas, détecte les `price_events`.                                                                                                                                                       |
| **Queue `confirm`**           | Confirmation de prix : re-requête l'itinéraire exact sur le même provider + ≥1 provider alternatif (Duffel) sous ~30–60 s. Écrit `CONFIRMED` / `EXPIRED`.                                                                            |
| **Queue `notify`**            | Consomme les `price_events` confirmés qui passent les règles + cooldown → `NotificationService` → canaux. Pattern outbox.                                                                                                            |

**Fiabilité :** `attempts` + backoff exponentiel · timeouts · **dead-letter queue** (`*.failed`) · **circuit breaker par provider** (`opossum`) — si ouvert, on saute le provider sans faire échouer toute la recherche · idempotence des écritures de snapshot (clé `(offer, provider, bucket temps)`).

**Séparation :** `apps/worker` est un process distinct de `apps/web` / `apps/api`, scalable indépendamment, partageant les `packages/*`.

---

## 7. Stratégie de surveillance adaptative

Intervalle de polling par palier, piloté par la config (aucune valeur codée en dur) :

| Palier   | Condition de déclenchement                                   | Intervalle (défaut, configurable)      |
| -------- | ------------------------------------------------------------ | -------------------------------------- |
| `COLD`   | aucune offre / loin de la cible / faible intérêt utilisateur | 60 min                                 |
| `NORMAL` | offres présentes, prix > 1,15 × cible ou > p50               | 30 min                                 |
| `WARM`   | prix à 5–15 % de la cible, ou tendance baissière, ou < p25   | 10 min                                 |
| `HOT`    | prix ≤ cible, ou ≤ p10, ou baisse récente > seuil            | 2 min                                  |
| `VERIFY` | une baisse/flash vient d'être détectée                       | vérification immédiate (1×) puis `HOT` |

`computeNextInterval(context)` prend en entrée :

- `currentPriceEur`, `targetPriceEur`, `maxPriceEur`
- stats : `p10 / p25 / p50`, `min_ever`, `avg`, pente récente (N derniers snapshots)
- `lastEventAt` / baisse récente
- `daysUntilDeparture` (plus proche → plus court, courbe de décroissance)
- `userInterest` (priorité recherche, dernière ouverture du dashboard, alerte active)
- `providerBudgetRemaining` (quota mensuel / coût) → plancher l'intervalle si budget bas
- `providerRateLimitHeadroom`

Sortie : `clamp(interval, providerMinInterval, tierMax)` + **jitter ±10 %** (anti thundering herd).

**Priorisation des combinaisons de dates** au sein d'une recherche : ne pas sonder toutes les combinaisons à chaque cycle. Score par combinaison (proximité des mois historiquement bas, proximité de la cible, ancienneté) → sonder le top-K par cycle, le reste en round-robin à la cadence `COLD`.

**Garde-fou budget :** `maxProviderCallsPerHour` global (config) ; le scheduler consomme un token bucket ; si épuisé, seules les recherches `HOT`/`VERIFY` s'exécutent.

---

## 8. Stratégie de détection des baisses flash

À chaque nouveau snapshot (worker `analyze`) :

1. Charger le snapshot précédent (même offre ; même provider prioritairement + meilleur inter-provider).
2. `dropAmount = prev.price_eur − new.price_eur` ; `dropPct = dropAmount / prev.price_eur`.
3. Classification (seuils en config, ajustables par cabine/route) :
   - `dropPct ≥ flashDropPct` (ex. 0,12) **ET** `dropAmount ≥ flashDropAbs` (ex. 120 €) **ET** intervalle entre snapshots ≤ `flashWindow` (ex. 90 min) → **candidat `FLASH_DROP`**
   - `dropPct ≥ priceDropPct` (ex. 0,05) → `PRICE_DROP`
   - `new.price_eur < min_ever` → `RECORD_LOW`
   - `new.price_eur ≤ target` → `TARGET_HIT`
   - `new.price_eur < p10` **ET** `n_observations ≥ minSampleSize` (ex. 30) → `UNUSUAL_PRICE`
4. **Filtres anti-faux-positifs** avant émission :
   - devise cohérente ; prix dans une bande plausible → sinon rejet (`REJECTED`)
   - `cabin_class` = `BUSINESS` confirmé dans le payload (pas « mixte », pas déclassé)
   - même identité d'itinéraire (`fingerprint`) — on ne compare pas un 1-escale à un 3-escales
   - le provider n'a pas renvoyé d'erreur / de résultat partiel sur ce run
   - baisse non expliquée par un changement de durée de séjour ou de couple de dates
5. Candidat validé → création `price_events` (`confirmed=false`) → enqueue `confirm`.
6. **Confirmation** (`confirm`) : re-requête l'itinéraire/date exact sur le **même provider** + **≥1 provider alternatif** (Duffel) sous ~30–60 s.
   - Si ≥1 source renvoie encore un prix ≤ `new.price_eur × (1 + tolérance)` (ex. 0,03) avec `availability = AVAILABLE` → `confirmed=true`, snapshot `CONFIRMED` → enqueue `notify`.
   - Sinon → `EXPIRED`, **pas de notification utilisateur** (log interne optionnel).
7. **Cooldown / anti-doublon :** notifier seulement si `alert.enabled` **et** `now − alert.last_triggered_at > alert.cooldown_seconds` **et** pas de collision `notifications.dedupe_key`. Mettre à jour `last_triggered_at`.
8. **Suivi de résolution :** quand un snapshot ultérieur montre le prix remonté → `price_events.resolved_at` + `duration_seconds` → alimente l'analytique « durée des baisses ».

---

## 9. Décisions à prendre avant la Phase 1

| #   | Décision                          | Recommandation                                                                                                                                                                                                                                                                                                                                                                                 | Impact si non tranché                                                  |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | **Framework API**                 | Fastify + couche use-cases (léger, DDD-friendly)                                                                                                                                                                                                                                                                                                                                               | Bloque la structure `apps/api`                                         |
| 2   | **Outil monorepo**                | pnpm workspaces + Turborepo                                                                                                                                                                                                                                                                                                                                                                    | Bloque le scaffolding                                                  |
| 3   | **ORM**                           | Drizzle (append-only + partitionnement `price_snapshots` plus simple) ; Prisma si priorité DX/migrations                                                                                                                                                                                                                                                                                       | Bloque `packages/database`                                             |
| 4   | **Budget provider réel**          | Post-roadmap : `SerpApiFlightProvider` (payant, quasi live) + `DuffelFlightProvider` (payant, oracle) livrés. **Voie gratuite retenue** : `TravelpayoutsProvider` (Data API, gratuit) — données **réelles mais en cache ~48 h**, plutôt éco → le radar devient « suivi de tendance / meilleur moment » plus que « chasse aux flash drops ». Voir [`FLIGHT_PROVIDERS.md`](FLIGHT_PROVIDERS.md). | Faisabilité du cœur produit — **résolue** (gratuit dégradé, ou payant) |
| 5   | **Compte Duffel production**      | Créer le compte (vérification + CGU) pour l'oracle de confirmation + liens de réservation ?                                                                                                                                                                                                                                                                                                    | Impacte la fiabilité de la confirmation flash                          |
| 6   | **Auth**                          | Pas d'auth (utilisateur unique dev) jusqu'à Phase 5 ; Auth.js (magic link, SMTP requis) en Phase 6                                                                                                                                                                                                                                                                                             | Impacte le modèle `users` / API                                        |
| 7   | **Mode Radar (sans destination)** | ✅ Phase 9 : liste seed statique `CDG_LONGHAUL_DESTINATIONS` (~53 aéroports) dans `@fbr/flight-domain` — pas de table `airports`. Le worker sonde une tranche rotative par run. Voir [`RECOMMENDATIONS.md`](RECOMMENDATIONS.md).                                                                                                                                                               | Résolu Phase 9                                                         |
| 8   | **Cible d'hébergement**           | VPS / Fly.io / Railway / serveur perso ? Détermine hébergement PG+Redis, cron, élection de leader                                                                                                                                                                                                                                                                                              | Impacte docker-compose & scheduler                                     |
| 9   | **Devise & source FX**            | Base analytique = EUR ; source FX gratuite (Frankfurter / ECB / exchangerate.host)                                                                                                                                                                                                                                                                                                             | Bloque la normalisation des prix                                       |
| 10  | **Rétention des données**         | Conserver tous les snapshots (append-only), partitionnement mensuel dès le départ                                                                                                                                                                                                                                                                                                              | Impacte le schéma dès Phase 1                                          |
| 11  | **Canaux de notification MVP**    | console + **Telegram** (gratuit, push-like, simple) d'abord, email ensuite                                                                                                                                                                                                                                                                                                                     | Bloque `packages/notifications` scope                                  |
| 12  | **Cadre légal**                   | Confirmer : produit de surveillance/recommandation personnel, pas de redistribution publique des fares, réservation via deep-link, dépendance à SerpApi (pas de scraping maison en prod)                                                                                                                                                                                                       | Risque juridique                                                       |

---

## 10. Roadmap

| Phase                         | Contenu                                                                                                                                                                                                                                  | Livrable « done »                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **0** (en cours)              | Ce rapport + décisions §9                                                                                                                                                                                                                | Rapport validé, décisions tranchées                         |
| **1 — Foundation**            | Monorepo, TS strict, ESLint/Prettier, Vitest, Drizzle+PG, Redis, docker-compose, `packages/config`, CI GitHub Actions, logger pino                                                                                                       | `pnpm test` + `docker compose up` OK                        |
| **2 — Flight domain**         | Types `FlightOffer` / `FlightSearchRequest` + Zod, interface `FlightProvider`, `MockFlightProvider` (7 scénarios), normalizer + validation + déduplication, tests unitaires                                                              | Mock renvoie des offres normalisées testées                 |
| **3 — Search engine**         | CRUD `searches` + API, générateur de combinaisons de dates + prioriseur, setup BullMQ, scheduler, worker `search`, stockage snapshots, tests d'intégration (Testcontainers)                                                              | Une recherche tourne en arrière-plan et écrit des snapshots |
| **4 — Price history**         | `packages/analytics` (avg/median/percentile/volatilité/trend/mensuel/jour/saison), dérivation `price_events`, endpoints, tests                                                                                                           | Stats calculées + testées, garde « données insuffisantes »  |
| **5 — Alert engine**          | Moteur de règles (5 types), cooldown, worker `confirm`, `NotificationService` + canal console, E2E : créer → run → snapshot → baisse → confirmer → notifier                                                                              | Test E2E vert de bout en bout                               |
| **6 — Frontend**              | Dashboard Next.js, pages recherches, historique offre + graphiques (Recharts), UI alertes, page analytics, auth                                                                                                                          | Dashboard utilisable contre le Mock                         |
| **7 — Real providers**        | Adaptateur **SerpApi** (1er), puis **Duffel** (+ oracle de confirmation), fiches providers finalisées, contract tests sur fixtures enregistrées                                                                                          | Données réelles CDG→Tokyo business dans l'historique        |
| **8 — Notifications**         | Email (Resend/SMTP), bot Telegram, webhook Discord optionnel, scaffold push mobile                                                                                                                                                       | Notifications multi-canal + cooldown                        |
| **9 — Smart recommendations** | `OpportunityScore`, moteur de recommandation de dates, analyse mensuelle/annuelle du meilleur moment, mode **Flight Radar** (sans destination)                                                                                           | Recommandations top-3 dates + classement Radar              |
| **10 — AI Advisor** ✅        | `@fbr/advisor` : `AdvisorInput` (faits) → conseil FR ; garde-fou `assertGrounded` + eval ; `MockLlmClient` (défaut déterministe) / `AnthropicLlmClient` (si clé). `GET /api/searches/:id/advice`. Voir [`AI_ADVISOR.md`](AI_ADVISOR.md). | Advisor testé, ne cite que des données du système ✅        |

**Règle de fin de phase :** expliquer → implémenter → tester → exécuter les tests → corriger → mettre à jour la doc → vérifier la non-régression → résumer → proposer l'étape suivante. Une feature n'est jamais « terminée » parce que le code compile ; le projet doit être réellement exécutable et testable.
