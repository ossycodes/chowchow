# ChowChow

A production-shaped, from-scratch build of an on-demand food/grocery
delivery platform — a three-sided, real-time logistics marketplace (customers, vendors,
riders).

**Architecture:** full microservices (Node.js / TypeScript / NestJS), database-per-service,
Kafka event backbone, sync via gRPC/REST through an API gateway. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full reference, the decisions log,
and the phased roadmap.

**Want to run & test it yourself?** Follow the **[Full Testing Guide](docs/TESTING.md)** —
run the whole stack and test every flow (auth, catalog, checkout, the Kafka dispatch loop,
and realtime WebSocket tracking), with expected outputs and the Kafka + MySQL dashboards.
(The Phase-0 [Runbook](docs/RUNBOOK.md) covers just identity + notifications.)

**New here?** Read the plain-language [ELI5 docs](docs/eli5/README.md) — every feature is
explained with everyday analogies before you dive into the code. New to **NestJS**? The
[Codebase Walkthrough](docs/CODEBASE_WALKTHROUGH.md) explains NestJS and tours every file
folder-by-folder.

**Dashboards** (after `pnpm infra:up`): Kafka → <http://localhost:8080> · MySQL → <http://localhost:8081> · Redis → <http://localhost:8082>

## Stack

| Concern | Choice |
|---------|--------|
| Language / framework | TypeScript · NestJS |
| Monorepo | pnpm workspaces · Turborepo |
| Datastore | MySQL 8 (one DB per service) · Drizzle ORM |
| Cache / geo / queues | Redis · BullMQ |
| Event backbone | Kafka (Redpanda locally) |
| Runtime infra | Docker Compose now → Kubernetes later |

## Repository layout

```
apps/            one NestJS app per microservice (independently deployable)
  api-gateway/     single public front door — JWT auth, routing/proxy, rate limit, CORS
  identity/        auth (register/login/refresh, JWT + bcrypt), accounts in MySQL (Drizzle)
  catalog/         vendors + menu items (browse public, writes authed), MySQL (Drizzle)
  order/           checkout (gRPC price lookup from catalog) + order lifecycle, MySQL
  dispatch/        event-driven rider assignment + realtime tracking (Socket.IO/WebSockets)
  payments/        charges on order.created → payment.succeeded (idempotent, kobo)
  ledger/          double-entry bookkeeping — books payment.succeeded (debit/credit)
  settlements/     accrues vendor earnings → pays out → settlement.completed
  notifications/   listens for user.registered → sends welcome (idempotent consumer)
libs/
  contracts/       shared event schemas + DTOs (the ONLY cross-service coupling)
  kafka/           producer + outbox pattern + relay (framework-agnostic)
  nest/            shared NestJS utils: Zod validation pipe + fail-fast env config
infra/
  docker-compose.yml   mysql, redis, redpanda (kafka) + dashboards (adminer, redpanda-console, redisinsight)
  mysql/init/          per-service database bootstrap
docs/
  RUNBOOK.md               step-by-step: run & test everything + dashboards
  insomnia/                importable Insomnia API collection
  ARCHITECTURE.md          architecture, decisions log, roadmap
  CODEBASE_WALKTHROUGH.md  NestJS primer + file-by-file tour
  eli5/                    plain-language explanation of every feature
```

## Prerequisites

- Node.js 20+ (`.nvmrc` pins 20)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Docker + Docker Compose

## Getting started

```bash
# 1. install workspace dependencies
pnpm install

# 2. copy env
cp .env.example .env

# 3. start local infra (MySQL, Redis, Redpanda/Kafka, console on :8080)
pnpm infra:up

# 4. create the identity DB tables (Drizzle migrations)
pnpm --filter @chowdeck/identity db:migrate

# 5. build everything (Turbo resolves the dependency graph)
pnpm build

# 6. run the identity service
pnpm --filter @chowdeck/identity dev      # watch mode
# or: node apps/identity/dist/main.js

# health check
curl http://localhost:3001/health
curl http://localhost:3001/health/topics  # proves shared-contracts wiring
```

Kafka console UI: <http://localhost:8080> · Redpanda broker: `localhost:9092`

## Common commands

| Command | Does |
|---------|------|
| `pnpm build` | Build all packages (dependency-ordered) |
| `pnpm dev` | Run all services in watch mode |
| `pnpm typecheck` | Type-check the workspace |
| `pnpm infra:up` / `infra:down` | Start / stop local infra |
| `pnpm infra:logs` | Tail infra logs |

## Status

- [x] **Phase 0 — foundations:** monorepo, infra Compose, shared `contracts` lib,
      `identity` service (health slice), Turbo build graph.
- [x] **Events backbone:** `libs/kafka` (producer + outbox + relay, tested),
      `identity` emits `user.registered` via the outbox pattern.
- [x] **First consumer:** `libs/kafka` consumer + idempotency,
      `notifications` subscribes to `user.registered` → welcome (dedupes duplicates).
      Full publish→subscribe loop proven.
- [x] **Real database:** `identity` persists to MySQL via **Drizzle ORM**; user + outbox
      written in one transaction; drizzle-kit migrations; unique-email → 409.
- [x] **Validation hardening:** shared `@chowdeck/nest` (Zod validation pipe + fail-fast
      env config); request DTOs with DB-aligned bounds; public register forced to
      `customer` (privilege fix); input whitelisting.
- [x] **API gateway + auth:** `identity` login/refresh (JWT access+refresh, bcrypt
      passwords); `api-gateway` single front door — verifies JWT, routes/proxies to
      services, injects `x-user-id` (anti-spoofing), rate limit, CORS, helmet.
- [x] **Catalog service:** `catalog` owns vendors + menu items in its own MySQL DB
      (Drizzle); prices in kobo; browsing (GET) is public, writes (POST/PATCH) are
      gateway-authed by HTTP method.
- [x] **Internal gRPC:** shared `.proto` in `libs/contracts/proto/`; `catalog` runs a
      hybrid app (REST + gRPC) exposing `Catalog.GetItems` for service-to-service price
      lookups. External edge stays REST; internal mesh is gRPC (decision D8).
- [x] **Ordering service:** `order` checkout fetches live prices from `catalog` over gRPC
      (client can't set price), snapshots them, computes totals in kobo, and persists the
      order + items + `order.created` outbox event in one transaction; guarded order-status
      state machine; per-customer ownership.
- [x] **Event-driven dispatch:** `order` emits `order.ready` → `dispatch` assigns an online
      rider and emits `dispatch.rider_assigned` → `order` consumes it and advances to
      `RIDER_ASSIGNED`. Full async loop over Kafka (outbox + idempotent consumers); no-rider
      falls back to a PENDING assignment.
- [x] **Realtime tracking:** Socket.IO WebSockets — riders stream location, customers watch
      their order's rider live (per-order rooms, JWT-authed handshake, ownership-checked);
      WS proxied through the gateway (one front door). Kafka-loop **integration test** added
      (real Redpanda+MySQL).
- [x] **Payments:** `payments` consumes `order.created`, charges via a swappable
      `PaymentProvider` port (fake adapter now), emits `payment.succeeded` → `order`
      auto-advances `CREATED → PAID`. Never double-charges (unique `orderId` + idempotent
      consumer); amounts in kobo.
- [x] **Ledger:** `ledger` books each `payment.succeeded` as a balanced double-entry journal
      (`DEBIT cash / CREDIT vendor_payable`); refuses unbalanced journals; idempotent
      (unique `reference`). `/ledger/accounts` (balances) + `/ledger/journals`.
- [x] **Settlements:** `settlements` accrues a per-payment earning (idempotent by
      `paymentId`), pays out each vendor's unsettled total on `/settlements/run`, and emits
      `settlement.completed` → `ledger` books `DEBIT vendor_payable / CREDIT cash`, netting the
      vendor to zero. Full money loop closed & balanced.
- [x] **Commission split:** `payments` takes a platform commission (`COMMISSION_BPS`, default
      20%) and publishes the breakdown; `ledger` books a balanced 3-way split
      (`cash` / `vendor_payable` / `platform_revenue`); `settlements` pays vendors the **net**.
- [x] **Durable idempotency:** `libs/kafka` `RedisProcessedEventStore` — consumer dedupe state
      lives in **Redis** (survives restarts, shared across instances) when `REDIS_URL` is set,
      else in-memory. Wired into all consumer services; RedisInsight dashboard on :8082.
      *(current)*
- [ ] Phase 3 (cont.) — rider delivery fee (4th split), payout scheduler, real transfer
      provider; nearest-rider matching
- [ ] Phase 4 — ops & scale (Kubernetes)

See the roadmap in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#10-phased-roadmap).
