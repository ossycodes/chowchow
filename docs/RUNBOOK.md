# Runbook — Run & Test Everything Yourself

A step-by-step guide to run the whole system locally, test every flow, and watch it happen
in the **Kafka** and **MySQL** dashboards. Copy-paste friendly, with expected outputs.

> New to the concepts? Read [`eli5/`](eli5/README.md) first. New to NestJS/the code?
> See [`CODEBASE_WALKTHROUGH.md`](CODEBASE_WALKTHROUGH.md).
>
> **This runbook covers the Phase-0 slice (identity + notifications).** For the full current
> stack — catalog, order (gRPC), the Kafka dispatch loop, and realtime WebSocket tracking —
> use the [**Full Testing Guide**](TESTING.md).

---

## 0. What you'll end up with

- 4 infra containers: **MySQL**, **Redis**, **Redpanda (Kafka)**, plus two dashboards.
- 2 running services: **identity** (registers users) and **notifications** (sends welcomes).
- Two dashboards in your browser:
  - **Kafka** → <http://localhost:8080> (Redpanda Console)
  - **MySQL** → <http://localhost:8081> (Adminer)

---

## 1. One-time setup

### 1.1 Prerequisites

- **Node.js 20+** — check with `node -v`
- **Docker Desktop** — check with `docker -v` and make sure Docker Desktop is **running**
- **pnpm 9** via Corepack (ships with Node):

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v   # → 9.15.0
```

### 1.2 Install dependencies & create your env file

From the repo root (`.../chowdeck`):

```bash
pnpm install
cp .env.example .env      # if you don't already have a .env
```

---

## 2. Start the infrastructure

```bash
pnpm infra:up
```

This starts MySQL, Redis, Redpanda (Kafka), the Kafka console, and the MySQL console.
Check they're healthy:

```bash
docker compose -f infra/docker-compose.yml ps
```

Expected (STATUS should say `Up ... (healthy)` for mysql/redis/redpanda):

```
NAME                        STATUS                    PORTS
chowdeck-adminer            Up ...                    0.0.0.0:8081->8080/tcp
chowdeck-mysql              Up ... (healthy)          0.0.0.0:3306->3306/tcp
chowdeck-redis              Up ... (healthy)          0.0.0.0:6379->6379/tcp
chowdeck-redpanda           Up ... (healthy)          0.0.0.0:9092->9092/tcp ...
chowdeck-redpanda-console   Up ...                    0.0.0.0:8080->8080/tcp
```

> **If image pulls fail** with `no such host` / `registry-1.docker.io`: that's a transient
> Docker Desktop DNS glitch. Fix: **quit and reopen Docker Desktop**, wait for it to say
> "running", then `pnpm infra:up` again. (Test with `docker pull hello-world`.)

---

## 3. Create the database tables (migrations)

The `identity` service owns tables in the `chowdeck_identity` database. Create them:

```bash
pnpm --filter @chowdeck/identity db:migrate
```

Expected: `[✓] migrations applied successfully!`

---

## 4. Build everything

```bash
pnpm build
```

Expected: `Tasks:  4 successful, 4 total` (contracts, kafka, identity, notifications).

---

## 5. Run the services

There are **two modes**. Start with Mode A to learn the flow, then try Mode B for the real
distributed experience.

### Mode A — Simple (no Kafka, in-memory) — quickest

Good for testing one service at a time. Kafka is stubbed with an in-memory recorder.

```bash
# identity on :3001 (still uses real MySQL)
node apps/identity/dist/main.js
```

In this mode identity publishes to an in-memory recorder you can peek at via
`GET /auth/_published` (see §6.2).

### Mode B — Full (real Kafka, cross-service) — the real deal

Open **two terminals** (both from the repo root).

**Terminal 1 — identity (publishes to Kafka):**

```bash
KAFKA_ENABLED=true node apps/identity/dist/main.js
```

Expected logs:

```
[DbService] connected to MySQL (chowdeck_identity)
[RelayRunner] outbox relay started (every 1000ms)
[Bootstrap] identity service listening on http://localhost:3001
```

**Terminal 2 — notifications (consumes from Kafka):**

```bash
KAFKA_ENABLED=true KAFKA_BROKERS=localhost:9092 NOTIFICATIONS_HTTP_PORT=3002 \
  node apps/notifications/dist/main.js
```

Expected logs:

```
[ConsumerRunner] consumer running — subscribed to topic "identity"
[Bootstrap] notifications service listening on http://localhost:3002
```

> Tip: for auto-reload during development use `pnpm --filter @chowdeck/identity dev`
> (prefix with the same `KAFKA_ENABLED=true ...` env vars for Mode B).

---

## 6. Test the flows

Two ways: an **Insomnia collection** (recommended, click-to-run) or **`curl`**.

### Import the Insomnia collection

1. In Insomnia: **Create / Import** → **File** → choose
   [`docs/insomnia/chowdeck.insomnia.json`](insomnia/chowdeck.insomnia.json).
2. You'll get a **Chowdeck (local)** collection with two folders — **identity (:3001)** and
   **notifications (:3002)**. URLs are hardcoded to `localhost`, so there's **nothing to
   configure** — just Send. (If you run services on other ports, edit the request URLs, or
   use the included Base Environment vars.)
3. Click any request → **Send**. Suggested order: identity → *Health*, then *Register ·
   Customer*, then notifications → *Sent welcomes*. Send *Register · Duplicate* twice to see
   the `409`, and *Simulate · Idempotency* twice to see the duplicate skipped.

The `curl` equivalents for every request are below.

### `curl` equivalents

### 6.1 Health checks

```bash
curl -s http://localhost:3001/health        ; echo
curl -s http://localhost:3001/health/topics ; echo
curl -s http://localhost:3002/health        ; echo
```

Expected:

```json
{"service":"identity","status":"ok","ts":"..."}
{"topics":["identity","catalog","order","dispatch","payment","ledger","rider","notification"]}
{"service":"notifications","status":"ok","kafka":"enabled","ts":"..."}
```

### 6.2 Register a user (the main flow)

```bash
curl -s -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","phone":"+2348012345678"}' ; echo
```

Expected:

```json
{"user":{"userId":"<uuid>","actorType":"customer","email":"ada@example.com","phone":"+2348012345678"}}
```

What just happened: identity validated the input, wrote the **user row + an outbox row in one
transaction**, and (a second later) the relay published the `user.registered` event.

- **Mode A:** see the published event with `curl -s http://localhost:3001/auth/_published`
- **Mode B:** the `notifications` service receives it and sends a welcome — check:

```bash
curl -s http://localhost:3002/notifications/_sent ; echo
```

Expected (Mode B):

```json
{"sent":[{"to":"ada@example.com","channel":"email","message":"Welcome to Chowdeck, ada@example.com! 🎉 ...","at":"...","eventId":"<uuid>"}]}
```

### 6.3 Error cases

```bash
# invalid email → 400
curl -s -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' -d '{"email":"not-an-email"}' ; echo
# → {"message":["Invalid email"],"error":"Bad Request","statusCode":400}

# duplicate email → 409 (the DB's unique constraint)
curl -s -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' -d '{"email":"ada@example.com"}' ; echo
# → {"message":"email already registered","error":"Conflict","statusCode":409}
```

### 6.4 Idempotency (no double welcomes)

`notifications` has a dev endpoint that pushes an event through the real handler. Send the
**same `eventId` twice** and watch the second one get skipped:

```bash
curl -s -X POST http://localhost:3002/notifications/_simulate \
  -H 'Content-Type: application/json' -d '{"email":"chidi@example.com","eventId":"evt-1"}' ; echo
curl -s -X POST http://localhost:3002/notifications/_simulate \
  -H 'Content-Type: application/json' -d '{"email":"chidi@example.com","eventId":"evt-1"}' ; echo
# sentCount goes up by 1 the first time, stays the same the second time
```

---

## 7. See it in the dashboards

### 7.1 Kafka dashboard — Redpanda Console → <http://localhost:8080>

1. Open <http://localhost:8080>.
2. Click **Topics** in the sidebar → click the **`identity`** topic.
3. Open the **Messages** tab. You'll see each `user.registered` event, with:
   - **Key** = the user's id
   - **Value** = the full event envelope (JSON: `id`, `type`, `payload`, …)
   - **Headers** = `event-type`, `event-version`, `producer`, `correlation-id`
4. Register another user (§6.2) and hit refresh — a new message appears in real time.

_(CLI equivalent, if you prefer:)_

```bash
docker exec chowdeck-redpanda rpk topic consume identity -n 1 --offset start
```

### 7.2 MySQL dashboard — Adminer → <http://localhost:8081>

1. Open <http://localhost:8081>. Log in with:
   - **System:** `MySQL`
   - **Server:** `mysql`   *(pre-filled)*
   - **Username:** `root`
   - **Password:** `root`
   - **Database:** `chowdeck_identity`
2. Click **`users`** → **Select data** to see registered users.
3. Click **`outbox_events`** → **Select data**. Note the `sent_at` column: `NULL` briefly,
   then a timestamp once the relay publishes it.

_(CLI equivalent:)_

```bash
docker exec chowdeck-mysql mysql -uroot -proot \
  -e "USE chowdeck_identity; SELECT email FROM users; SELECT topic, sent_at FROM outbox_events;"
```

---

## 8. Run the automated tests

```bash
pnpm test
```

Expected: `Tests  7 passed (7)` (outbox + consumer/idempotency logic).

---

## 9. Stop everything

```bash
# stop the node services: Ctrl+C in each terminal

# stop infra (keeps data volumes):
pnpm infra:down

# stop infra AND wipe all data (fresh start next time):
docker compose -f infra/docker-compose.yml down -v
```

---

## 10. Command cheat sheet

| Do | Command |
|----|---------|
| Start infra | `pnpm infra:up` |
| Infra status | `docker compose -f infra/docker-compose.yml ps` |
| Migrate identity DB | `pnpm --filter @chowdeck/identity db:migrate` |
| Build all | `pnpm build` |
| Run identity (Kafka) | `KAFKA_ENABLED=true node apps/identity/dist/main.js` |
| Run notifications (Kafka) | `KAFKA_ENABLED=true KAFKA_BROKERS=localhost:9092 NOTIFICATIONS_HTTP_PORT=3002 node apps/notifications/dist/main.js` |
| Run tests | `pnpm test` |
| Kafka dashboard | <http://localhost:8080> |
| MySQL dashboard | <http://localhost:8081> |
| Stop infra | `pnpm infra:down` |

## Ports reference

| Port | What |
|------|------|
| 3001 | identity service (HTTP) |
| 3002 | notifications service (HTTP) |
| 3306 | MySQL |
| 6379 | Redis |
| 9092 | Kafka (Redpanda) broker |
| 8080 | Kafka dashboard (Redpanda Console) |
| 8081 | MySQL dashboard (Adminer) |
