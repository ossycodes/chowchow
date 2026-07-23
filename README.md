# ChowChow

A production-shaped, from-scratch build of a an on-demand food/grocery
delivery platform — a three-sided, real-time logistics marketplace (customers, vendors,
riders).

**Architecture:** full microservices (Node.js / TypeScript / NestJS), database-per-service,
Kafka event backbone, sync via gRPC/REST through an API gateway. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full reference, the decisions log,
and the phased roadmap.

**Want to run & test it yourself?** Follow the **[Runbook](docs/RUNBOOK.md)** — step by step,
with expected outputs and the Kafka + MySQL dashboards.

**New here?** Read the plain-language [ELI5 docs](docs/eli5/README.md) — every feature is
explained with everyday analogies before you dive into the code. New to **NestJS**? The
[Codebase Walkthrough](docs/CODEBASE_WALKTHROUGH.md) explains NestJS and tours every file
folder-by-folder.

**Dashboards** (after `pnpm infra:up`): Kafka → <http://localhost:8080> · MySQL → <http://localhost:8081>

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
  identity/        auth, accounts — persists users to MySQL (Drizzle), emits user.registered
  notifications/   listens for user.registered → sends welcome (idempotent consumer)
libs/
  contracts/       shared event schemas + DTOs (the ONLY cross-service coupling)
  kafka/           producer + outbox pattern + relay (framework-agnostic)
infra/
  docker-compose.yml   mysql, redis, redpanda (kafka), redpanda-console
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
      written in one transaction; drizzle-kit migrations; unique-email → 409. *(current)*
- [ ] Phase 1 — catalog + ordering
- [ ] Phase 2 — dispatch + realtime
- [ ] Phase 3 — money hardening (ledger, settlements)
- [ ] Phase 4 — ops & scale (Kubernetes)

See the roadmap in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#10-phased-roadmap).
