# Chowdeck (clone) — Architecture & Build Reference

A production-minded reference for building a Chowdeck-style, on-demand food/grocery
delivery platform from scratch. Anchored to a **Node.js + TypeScript** stack (mirrors
Chowdeck's real stack: Node.js, MySQL, Redis, AWS/GCP).

> Read this before writing code. It captures the domain, the reference architecture,
> the hard parts (dispatch + money), and the production practices that matter early.

---

## 0. Decisions log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Full microservices from day one** — independently deployable services, DB-per-service, Kafka event backbone | Build the real big-player architecture; each service scales/deploys independently |
| D2 | **Unified TypeScript / NestJS** (no polyglot) | One language across all services — fastest for one team, matches Chowdeck's Node stack |
| D3 | **Docker Compose now, Kubernetes later** | Kafka + services run locally via Compose; introduce K8s/Terraform/mesh when we deploy to cloud |
| D4 | **pnpm-workspace + Turborepo monorepo** | Shared contracts/libs, atomic cross-service changes, one CI; bootstraps cleanly with no interactive generators |
| D5 | **Redpanda as local Kafka** | Kafka-API compatible, single binary, light on the laptop |
| D6 | **Async-first (Kafka events) + sync gRPC/REST via gateway** | Loose coupling; saga orchestration for the order flow |
| D7 | **Drizzle ORM + mysql2** (not Prisma) | Prisma downloads engine binaries from `binaries.prisma.sh`, which is blocked in this environment; Drizzle is pure-TS, codegen-free, fully typed, and works offline — a solid production choice for microservices |
| D8 | **gRPC for internal service-to-service; REST/JSON only at the public edge (gateway)** | Realizes D6. Internal calls (first: order→catalog at checkout) use gRPC — one typed `.proto` contract, HTTP/2, batching; external clients keep simple REST through the gateway. Runtime proto-loader (`@grpc/proto-loader`), no codegen step; protos live in `libs/contracts/proto/` |
| D9 | **Realtime over Socket.IO (WebSockets), proxied through the gateway; auth on the handshake** | Live tracking needs a persistent connection, not polling. Socket.IO lives on `dispatch`; the gateway proxies the WS upgrade so the single-front-door rule (D8) still holds. The JWT rides on the handshake and dispatch verifies it; per-order rooms with ownership checks isolate customers. In-process assignment→push is decoupled via a Nest EventEmitter |

---

## 1. What we're actually building

Chowdeck is a **three-sided, real-time logistics marketplace** — a dispatch/logistics
company with a consumer storefront on top. It is *not* "a food app."

**The three sides**

| Actor | Needs |
|-------|-------|
| **Customer** | Discover vendors, order food/grocery/pharmacy, pay, track live, rate |
| **Vendor** (restaurant/store) | Receive orders, accept/reject, mark preparing/ready, manage menu & availability, view payouts |
| **Rider** (logistics) | Get dispatched, navigate pickup→dropoff, update status, cash/COD reconciliation, earnings |

**Internal actors:** Ops/Admin, Finance/Settlements, Support.

**The two genuinely hard, high-value subsystems** (everyone underestimates these):
1. **Dispatch** — matching orders to riders in real time (and later, batching).
2. **Money movement** — wallets, ledger, settlements, payouts, reconciliation.

---

## 2. How the big players are built (patterns worth stealing)

Research across DoorDash, Uber Eats, Swiggy/Zomato, Glovo:

- **Domain-oriented services + event streaming.** Coarse-grained services (not
  nano-services) over a Kafka event backbone, fronted by an API gateway / BFF.
- **Saga pattern for orders.** One order spans payment + inventory + dispatch; use
  sagas with **compensating actions** (auto-refund if no rider is found, etc.).
- **Dispatch = ML predictions + optimization.** DoorDash's "DeepRed" predicts
  food-ready time, rider ETA, and acceptance probability, then a mixed-integer program
  assigns and **batches** orders. Start greedy, evolve toward this.
- **Real-time layer is separate.** Live location + tracking over **WebSockets**, with
  positions in **Redis GEO** — never on the primary relational DB.
- **Payments never depend on one provider.** Abstraction layer + failover, idempotency,
  webhooks as source of truth. Internal **double-entry ledger** for balances.

---

## 3. Architecture: full microservices (chosen direction)

> **Decision (see §0 Decisions log):** full microservices from day one, unified
> TypeScript/NestJS, Docker Compose locally (incl. Kafka) with Kubernetes later.
> Each service is independently deployable, owns its own database, and communicates
> **async via Kafka events** and **sync via gRPC/REST** through the gateway.

```
        Customer App   Vendor App   Rider App   Admin Web
             │             │            │           │
             └─────────────┴─────┬──────┴───────────┘
                       API Gateway  (REST + WebSocket, authN/Z, rate limit)
                                  │  sync: gRPC/REST
   ┌──────────────────────────────────────────────────────────────────┐
   │                     Services (each: own DB)                       │
   │  identity   catalog   search   pricing   order-orchestrator       │
   │  dispatch   location   payments   ledger   settlement             │
   │  promotions   notifications   ratings   admin                     │
   └───────────────────────────────┬──────────────────────────────────┘
                                    │  async: domain events
                         ┌──────────┴───────────┐
                         │   Kafka event bus     │  order.*, rider.*,
                         │  (Redpanda locally)   │  payment.*, saga.*
                         └───────────────────────┘
   Polyglot persistence: MySQL per service · Redis (cache/GEO/queues) ·
   Elasticsearch (search) · S3 (assets) · warehouse (analytics, later)
```

**Golden rules of the decomposition**
- **Database-per-service.** No service reads another's tables. Data is shared only via
  events or an API call. (In Compose we run one MySQL instance with a schema/DB per
  service to keep it light; the boundary is enforced in code, not shared queries.)
- **Async-first.** Prefer emitting/consuming Kafka events over synchronous calls.
  Reserve sync gRPC/REST for read queries the gateway needs immediately.
- **The order-orchestrator owns the saga** — it coordinates payment → vendor accept →
  dispatch and issues compensating actions on failure. Other services stay dumb about
  the global flow.
- **Outbox pattern** in every service that emits events (write state + outbox row in one
  DB tx; a relay publishes to Kafka). Guarantees no lost/ghost events.

### Services (bounded contexts)

| Service | Owns | Emits (examples) |
|---------|------|------------------|
| **api-gateway** | Edge routing, authN, rate limit, BFF aggregation, WebSocket | — |
| **identity** | Accounts (customer/vendor/rider/admin), auth, RBAC, KYC | `user.registered` |
| **catalog** | Vendors, stores, menus, items, modifiers, availability, hours, coverage | `menu.updated`, `vendor.status.changed` |
| **search** | Read model of vendors/dishes (CQRS projection of catalog) | — |
| **pricing** | Fees, surge, tax, promo application, quote generation | — |
| **order-orchestrator** | Order lifecycle state machine + **saga** | `order.created/paid/ready/…` |
| **dispatch** | Rider assignment, offers, batching, ETA | `rider.assigned`, `delivery.completed` |
| **location** | Live rider GPS ingest, Redis GEO index, tracking fan-out | `rider.location.updated` |
| **payments** | Provider adapters (Paystack/Flutterwave), charge, webhook ingest | `payment.succeeded/failed` |
| **ledger** | Double-entry ledger, wallets, balances | `ledger.entry.posted` |
| **settlement** | Vendor payouts, rider earnings, reconciliation | `payout.initiated` |
| **promotions** | Promo codes, campaigns, eligibility | — |
| **notifications** | Push (FCM/APNs), SMS, email, in-app, WS delivery | — |
| **ratings** | Post-delivery ratings for vendor + rider | `rating.submitted` |
| **admin** | Ops board, manual reassignment, refunds, onboarding | — |

### Monorepo & shared code

Single **pnpm-workspace + Nx** monorepo (unified TypeScript). Layout:

```
apps/            one NestJS app per service (independently deployable)
libs/
  contracts/     shared event schemas + DTOs (the ONLY cross-service coupling)
  kafka/         Kafka producer/consumer + outbox helpers
  observability/ OpenTelemetry, logging, health
  config/        typed env config
  testing/       Testcontainers + fixtures
infra/
  docker-compose.yml   mysql, redis, redpanda(kafka), redpanda-console
  k8s/                 (later)
```

`libs/contracts` is the contract boundary: services depend on shared *event/DTO types*,
never on each other's internal code.

---

## 4. Data stores

| Store | Use |
|-------|-----|
| **MySQL** | Source of truth: users, vendors, menus, orders, ledger. Use transactions. |
| **Redis** | Cache, rider geo-index (`GEOADD`/`GEOSEARCH`), rate limiting, BullMQ job queues, WebSocket pub/sub |
| **Object storage (S3/GCS)** | Menu images, KYC docs, receipts |
| **Elasticsearch/OpenSearch** *(later)* | Vendor & dish search, geo + relevance ranking |
| **Kafka** *(later)* | Event backbone when the monolith is split |
| **Warehouse (BigQuery/Redshift)** *(later)* | Analytics, dispatch ML training data |

**Rule:** high-frequency rider location writes go to **Redis only**. Persist sparse
snapshots/breadcrumbs to MySQL/warehouse asynchronously if needed for history.

---

## 5. Order lifecycle (explicit state machine)

```
CREATED ──▶ PAID ──▶ VENDOR_ACCEPTED ──▶ PREPARING ──▶ READY
                                                          │
                                                          ▼
                                RIDER_ASSIGNED ──▶ PICKED_UP ──▶ DELIVERED
Branches: CANCELLED (by customer/vendor/ops), REJECTED (vendor),
          NO_RIDER_FOUND ──▶ REFUNDED, FAILED_PAYMENT
```

- Model as a **state machine**; reject illegal transitions.
- Every transition **emits a domain event** (`order.paid`, `order.ready`, …).
- Dispatch listens for `order.ready` (or `order.accepted`, depending on prep-time
  strategy) to trigger assignment.

---

## 6. Dispatch engine (the core IP)

**v1 — greedy geospatial assignment**
1. On trigger, query candidate riders via Redis `GEOSEARCH` around the vendor.
2. Filter: online, free (or batchable), vehicle type, rating, not recently rejected.
3. Score by distance/ETA; send a **timed offer** to the top rider.
4. On accept → assign. On reject/timeout → next candidate. Escalate to ops if exhausted.

**v2 — batching & optimization**
- Stack nearby pickups (same/adjacent vendor) into one rider route.
- Predict food-ready time so the rider arrives as food is ready (not early/cold).
- Move from greedy to a scoring function / MIP over a candidate set.

**v3 — ML-assisted** (DeepRed-style): predict ETA, acceptance probability, prep time;
optimize assignment + batching to minimize total delivery time and cost.

**Live tracking:** rider app streams GPS → WebSocket → Redis GEO + pub/sub → fan-out to
the watching customer(s). Compute ETA server-side; throttle client update frequency.

---

## 7. Payments & money (get this right early)

**Providers (Nigeria):** Paystack + Flutterwave primary; Monnify / dedicated virtual
accounts for bank transfer; USSD/card/transfer/wallet options. **Never** depend on one.

**Non-negotiables**
- **Payment abstraction layer** with per-provider adapters + failover.
- **Webhooks are the source of truth** — verify signatures; never trust client redirect.
- **Idempotency keys** on payment init and order create (client-supplied header).
- **Double-entry ledger**: wallet balance is *derived from* ledger entries, never a
  mutable `balance` column you `UPDATE`. Money in **integer minor units (kobo)**, never
  floats.
- **Outbox pattern**: write state change + outbox event in one DB transaction; relay
  async. Prevents "charged but no order."
- **Reconciliation jobs**: nightly settle provider records vs. internal ledger.
- **PCI**: never store raw card data — tokenize via the provider.

**Money flows to model:** customer charge → platform holding → vendor payout (minus
commission) + rider earnings + platform fee + delivery fee; refunds; COD/cash
reconciliation; promos/discounts as ledger entries.

---

## 8. Production practices from day one

- **Idempotency** on all money/side-effecting endpoints.
- **Observability:** structured logs, OpenTelemetry tracing, Prometheus/Grafana metrics,
  Sentry error tracking, uptime + on-call alerting.
- **Feature flags + per-city config** — delivery launches geography by geography.
- **Security:** RBAC, rate limiting, input validation, secrets manager, PII encryption,
  audit logs for money/admin actions.
- **Reliability:** graceful degradation (if dispatch is down, queue orders; if one payment
  provider is down, fail over), retries with backoff + DLQ, circuit breakers.
- **Delivery engineering:** CI/CD, DB migrations (forward-only), IaC (Terraform),
  blue-green/canary deploys, staging env with seed data.
- **Testing:** unit + integration (Testcontainers for MySQL/Redis), contract tests for
  payment webhooks, load tests for dispatch + tracking.

---

## 9. Recommended stack (concrete)

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | **TypeScript (Node.js 20)** | Unified across all services (D2); strong typing for money/state |
| Framework | **NestJS** | First-class microservices + gRPC + Kafka transport support |
| Monorepo | **pnpm workspaces + Nx** | Shared contracts/libs, one CI, atomic changes |
| DB | **MySQL 8** + **Drizzle ORM** (mysql2) | DB-per-service; transactions, migrations via drizzle-kit |
| Cache/geo/queue | **Redis** + **BullMQ** | GEO, rate limit, jobs, WS pub/sub |
| Event backbone | **Kafka** (Redpanda locally) | Domain events, outbox relay, saga choreography |
| Inter-service sync | **gRPC** (internal) / REST (edge) | Gateway → services |
| Realtime | **Socket.IO** + Redis adapter | Live tracking fan-out, horizontally scaled |
| Auth | JWT access + refresh (rotating) | Per-actor guards + RBAC, verified at gateway |
| Payments | **Paystack + Flutterwave** adapters | Abstraction + webhooks + ledger |
| Notifications | **FCM/APNs**, SMS (Termii/Twilio), email | |
| Infra | Docker Compose now → **K8s + Terraform** later, GitHub Actions | D3 |
| Observability | OpenTelemetry, Prometheus/Grafana, Sentry | Distributed tracing across services |
| Mobile | React Native (customer/vendor/rider) + admin web | 3 apps + admin |

---

## 10. Phased roadmap

**Phase 0 — Platform foundations** *(current)*
Nx + pnpm monorepo, Docker Compose (MySQL, Redis, Redpanda/Kafka + console), shared
libs (`contracts`, `kafka` with outbox, `config`, `observability`), api-gateway +
identity as the first vertical slice, health checks, structured logging, CI.

**Phase 1 — Catalog + Ordering (single city)**
catalog + search (CQRS projection) + pricing + order-orchestrator services, cart,
order state machine + saga skeleton, one payment provider (webhook-verified), all wired
over Kafka events.

**Phase 2 — Dispatch + Realtime**
dispatch + location services, Redis GEO index, greedy assignment + timed offers,
Socket.IO live tracking, notifications service.

**Phase 3 — Money hardening**
ledger (double-entry) + settlement services, wallet, vendor settlements, rider payouts,
second payment provider + failover, reconciliation jobs.

**Phase 4 — Ops & scale**
admin/ops board, feature flags + multi-city, batching in dispatch, full observability
(tracing across services) + load testing, **Kubernetes + Terraform** migration, service
mesh.

---

## 11. Sources

- DoorDash — Using ML & Optimization to Solve the Dispatch Problem (careersatdoordash.com)
- Uber Eats architecture deep dive (blog.stackademic.com)
- Food delivery system design write-ups (Medium, foodtech.folio3.com, enatega.com)
- Integrating local payments in Nigeria — Paystack/Flutterwave/Monnify (fortranhouse.com)
- Chowdeck stack references (public job listings / stack profiles)
