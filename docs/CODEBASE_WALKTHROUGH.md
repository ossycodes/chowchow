# Codebase Walkthrough (NestJS-focused)

A file-by-file, folder-by-folder tour of everything we've built so far, written for
someone **new to NestJS**. We first learn the NestJS mental model, then walk every file.

> This is the "how the code works" doc. For the plain-language "what & why", see
> [`eli5/`](eli5/README.md). For the design decisions, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Table of contents

- [Part 0 — NestJS in 10 minutes](#part-0--nestjs-in-10-minutes)
- [Part 1 — The repo root (workspace & tooling)](#part-1--the-repo-root)
- [Part 2 — `infra/` (local services)](#part-2--infra)
- [Part 3 — `libs/contracts` (the shared dictionary)](#part-3--libscontracts)
- [Part 4 — `libs/kafka` (the messaging toolkit)](#part-4--libskafka)
- [Part 5 — `apps/identity` (our first NestJS service, in depth)](#part-5--appsidentity)
- [Part 6 — `apps/notifications` (a listener service)](#part-6--appsnotifications)
- [Part 7 — Two end-to-end flows](#part-7--two-end-to-end-flows)
- [Glossary](#glossary)

---

## Part 0 — NestJS in 10 minutes

**NestJS** is a framework for building Node.js server apps in TypeScript. If you've seen
Express, Nest sits *on top of* Express and adds structure. The big ideas:

### 1. Everything is organized into **Modules**

A **module** is a box that groups related code. Every Nest app has at least a root module
(`AppModule`). A module declares four things:

```ts
@Module({
  imports:     [OtherModule],      // other modules whose exports I want to use
  controllers: [SomeController],   // classes that handle incoming HTTP requests
  providers:   [SomeService],      // injectable classes (business logic, etc.)
  exports:     [SomeService],      // providers I make available to modules that import me
})
export class SomeModule {}
```

`@Module({...})` is a **decorator** — the `@` syntax attaches metadata to a class. Nest
reads that metadata at startup to understand how to wire everything.

### 2. **Controllers** handle HTTP

A controller maps URLs to methods:

```ts
@Controller("health")          // routes under /health
export class HealthController {
  @Get()                        // GET /health
  check() { return { status: "ok" }; }
}
```

Whatever the method `return`s becomes the JSON response body. Decorators like `@Get()`,
`@Post()`, `@Body()`, `@Param()` describe the route and pull data out of the request.

### 3. **Providers** are your logic, and Nest injects them for you

A **provider** is any class marked `@Injectable()`. The killer feature is **Dependency
Injection (DI)**: you never write `new UsersService(...)`. You just *ask* for it in a
constructor, and Nest's **IoC container** creates it and hands it to you:

```ts
@Injectable()
export class AuthController {
  constructor(private readonly users: UsersService) {}   // Nest injects it
}
```

Nest knows *what* to inject by reading the TypeScript **type** of the parameter
(`UsersService`). This is why we import `reflect-metadata` and enable
`emitDecoratorMetadata` — they let type information survive to runtime so Nest can read it.

### 4. **Injection tokens** (for when a type isn't enough)

Sometimes the thing you want to inject is an **interface**, not a class. TypeScript
interfaces vanish at runtime, so Nest can't use them as a lookup key. The fix is a
**token** — a unique key you register a value under and inject by name:

```ts
export const MESSAGE_PRODUCER = Symbol("MESSAGE_PRODUCER");   // the token

// register a value under that token:
{ provide: MESSAGE_PRODUCER, useFactory: () => new InMemoryProducer() }

// ask for it by token:
constructor(@Inject(MESSAGE_PRODUCER) private producer: MessageProducer) {}
```

(You highlighted `MESSAGE_PRODUCER` earlier — that's exactly this pattern. We use it so the
same code can receive a Kafka producer in production or an in-memory one locally.)

Ways to register a provider:

| Form | Means |
|------|-------|
| `SomeClass` (shorthand) | "instantiate this class; its token is the class itself" |
| `{ provide: TOKEN, useClass: X }` | token → a class Nest instantiates |
| `{ provide: TOKEN, useValue: v }` | token → a ready-made value |
| `{ provide: TOKEN, useFactory: () => ... , inject: [Dep] }` | token → whatever the factory returns; `inject` lists tokens to pass into the factory |

### 5. **Lifecycle hooks**

Implement an interface and Nest calls your method at the right moment:

- `OnApplicationBootstrap` → `onApplicationBootstrap()` runs once everything is wired and
  the app is about to serve. Good for "start background work / connect to Kafka."
- `OnApplicationShutdown` → `onApplicationShutdown()` runs on shutdown. Good for "disconnect,
  clear timers." (Requires `app.enableShutdownHooks()`.)

### 6. **Bootstrapping**

`main.ts` is the entry point. `NestFactory.create(AppModule)` builds the whole tree from
the root module, and `app.listen(port)` starts the HTTP server.

That's the whole model: **Modules** group **Controllers** (HTTP) and **Providers** (logic),
Nest **injects** providers by type or token, and **lifecycle hooks** let you run code at
start/stop. Now the files.

---

## Part 1 — The repo root

We use a **monorepo**: all packages in one repo, managed by pnpm workspaces + Turborepo.

### `package.json` (root)
The workspace's "control panel." Key parts:
- `"private": true` — this root is never published to npm.
- `"packageManager": "pnpm@9.15.0"` — pins the tool so everyone uses the same pnpm.
- `scripts` — `pnpm build`, `pnpm test`, etc. all delegate to `turbo run <task>`, which
  runs that task across every package in the right order. `infra:*` scripts wrap Docker.
- `devDependencies` — tools shared by everything: `turbo`, `typescript`, `@types/node`.

### `pnpm-workspace.yaml`
Tells pnpm which folders are packages: `apps/*` and `libs/*`. pnpm then symlinks our
internal packages (e.g. `@chowdeck/contracts`) into each other's `node_modules`, so
`import ... from "@chowdeck/contracts"` just works without publishing anything.

#### What `"@chowdeck/nest": "workspace:*"` means

Inside a service's `package.json` you'll see internal dependencies written like this:

```json
"dependencies": {
  "@chowdeck/nest": "workspace:*"
}
```

It says: *"depend on the `@chowdeck/nest` package that lives in **this monorepo**, at
whatever version it currently is."* Two parts:

- **`@chowdeck/nest`** — the package **name** (declared by `libs/nest/package.json`'s
  `"name"` field). The `@chowdeck/` prefix is a **scope** — a namespace grouping all our
  internal packages (`@chowdeck/contracts`, `@chowdeck/kafka`, `@chowdeck/nest`).
- **`workspace:*`** — a pnpm protocol:
  - **`workspace:`** → "resolve this from the **local workspace**, not the npm registry."
    Without it, pnpm would try to download it from npmjs.com (where it doesn't exist — it's
    our private code). With it, pnpm **symlinks** `node_modules/@chowdeck/nest` → `libs/nest`.
  - **`*`** → the version range: "any version." Since it's local, we don't pin a number.

Why it matters:

```
apps/identity/node_modules/@chowdeck/nest  ──symlink──►  libs/nest
```

- Edit a file in `libs/nest` → identity sees it immediately (after a rebuild). No copy, no
  publish, no version bump.
- Turborepo reads these `workspace:*` deps to build the **dependency graph** — that's how it
  knows to build `@chowdeck/nest` *before* `identity`.
- On publish (if we ever did), pnpm auto-replaces `workspace:*` with the real version.

In short: **`workspace:*` = "this is one of our own in-repo packages; link it locally
instead of downloading it."**

### `turbo.json`
Turborepo's task graph. `"dependsOn": ["^build"]` means "before building me, build my
dependencies" (the `^` = upstream packages). That's why `contracts` always compiles before
the services that use it. `globalDependencies` lists files (like `tsconfig.base.json`) that,
when changed, invalidate the build cache everywhere.

### `tsconfig.base.json`
The shared TypeScript settings every package extends. Notables:
- `"experimentalDecorators"` + `"emitDecoratorMetadata"` — required for NestJS decorators
  and DI (see Part 0 §3).
- `"module": "nodenext"` — modern Node module resolution.
- `"strict": true` — maximum type safety.

### `.env.example` / `.env`
Environment variables (ports, DB creds, Kafka toggle, payment keys). `.env.example` is the
committed template; you `cp .env.example .env` and fill in real values. `.env` is gitignored.

### `.gitignore`, `.nvmrc`, `README.md`
Housekeeping: files git ignores, the pinned Node version (`20`), and the front-page docs.

---

## Part 2 — `infra/`

### `infra/docker-compose.yml`
Defines the local "helper machines" as containers: **MySQL** (database), **Redis**
(cache/geo/queues), **Redpanda** (a Kafka-compatible message broker), and the **Redpanda
console** (a web UI at :8080). `pnpm infra:up` starts them; each has a `healthcheck` so we
know when it's ready. Volumes persist data between restarts.

### `infra/mysql/init/01-databases.sql`
Runs automatically the first time MySQL starts. Creates **one database per service**
(`chowdeck_identity`, `chowdeck_catalog`, …). This enforces the *database-per-service*
rule: no service reaches into another's tables.

---

## Part 3 — `libs/contracts`

The **shared dictionary**: the message/event shapes every service agrees on. It's the
*only* thing services are allowed to share, which keeps them loosely coupled.

### `package.json`
Name `@chowdeck/contracts`. Depends on `zod` (a schema/validation library). `main` and
`types` point at `dist/…` — the compiled output other packages import.

### `tsconfig.json`
Extends the base config; compiles `src/` → `dist/`.

### `src/events/envelope.ts`
Defines the **event envelope** — the standard wrapper around every event:

```ts
export const eventEnvelopeSchema = z.object({
  id: z.string().uuid(),        // unique id → consumers dedupe on this
  type: z.string(),             // e.g. "user.registered"
  version: z.number(),          // payload schema version
  occurredAt: z.string(),       // ISO timestamp
  producer: z.string(),         // which service emitted it
  correlationId: z.string().optional(),
  payload: z.unknown(),         // the event-specific data
});
export type EventEnvelope<T> = ... ;
```

It's both a **Zod schema** (validates at runtime) and, via `z.infer`, a **TypeScript type**
(checks at compile time). One definition, two guarantees.

### `src/events/topics.ts`
A constant registry of Kafka **topic names** (`Order`, `Identity`, …). Centralizing them
stops typos where one service publishes to `"order"` and another listens on `"orders"`.

### `src/events/identity.events.ts`
Event definitions owned by the identity domain: the `ActorType` enum (customer/vendor/
rider/admin), the `user.registered` event type constant, and `userRegisteredSchema` (the
Zod shape of that event's payload — note `userId` must be a UUID and `email` must be valid).

### `src/events/order.events.ts`
The order domain's language: the full `OrderStatus` lifecycle (`CREATED → PAID → … →
DELIVERED`), order event types, and `orderCreatedSchema`. Money is `z.number().int()` in
**kobo** — integers only, never floats.

### `src/index.ts`
Re-exports everything so consumers write `import { Topics, EventEnvelope } from
"@chowdeck/contracts"` from one place.

---

## Part 4 — `libs/kafka`

The **messaging toolkit** — framework-agnostic (no NestJS in here, just plain classes), so
it's reusable and easy to unit-test. It's built with **ports & adapters**: we define an
interface (the "port"), then provide multiple implementations (the "adapters").

### `src/envelope.ts` — `wrapEvent()`
A helper that takes a payload and returns a full `EventEnvelope`: generates the `id`
(random UUID), stamps `occurredAt`, sets `producer`/`version`. Every event is created here.

### `src/producer.ts` — the publish **port** + in-memory adapter
```ts
export interface MessageProducer {         // the PORT (what publishing looks like)
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic, event, key?): Promise<void>;
}
export class InMemoryProducer implements MessageProducer { /* records to an array */ }
```
Business code depends on the **interface**, so we can swap implementations freely.

### `src/kafkajs-producer.ts` — the real adapter
`KafkaJsProducer implements MessageProducer` using the `kafkajs` library. Serializes the
envelope to JSON, sets a partition `key`, adds headers. Marked `idempotent: true` so broker
retries don't duplicate.

### `src/outbox.ts` — reliable publishing
The **outbox pattern** (explained plainly in [ELI5 #3](eli5/03-events-and-the-outbox.md)):
- `OutboxStore` (port) — `save`, `fetchUnsent`, `markSent`. In production `save` runs inside
  the *same DB transaction* as the business write, making "state changed" and "event
  recorded" atomic.
- `InMemoryOutboxStore` — a Map-backed adapter for local/tests.
- `OutboxRelay` — `drain()` fetches unsent records, publishes them, then marks them sent.
  Publish-first/mark-second gives **at-least-once** delivery.

### `src/consumer.ts` — the consume **port**
```ts
export type EventHandler = (event: EventEnvelope) => Promise<void>;
export interface MessageConsumer {
  connect(); disconnect();
  subscribe(topic, handler);   // register a handler for a topic
  run();                       // start delivering
}
```

### `src/kafkajs-consumer.ts` — the real consumer adapter
`KafkaJsConsumer` joins a **consumer group**, subscribes to topics, and for each Kafka
message parses the JSON back into an `EventEnvelope` and calls your handler.

### `src/idempotency.ts` — don't process twice
- `ProcessedEventStore` (port) — `markIfNew(id)` reserves an id (returns false if seen),
  `unmark(id)` releases it.
- `idempotent(store, handler)` — wraps a handler: reserve the id → run → on error, unmark
  so it can retry. This is how at-least-once delivery stays safe.

### `src/in-memory-bus.ts` — a fake broker for tests
`InMemoryBus` implements **both** `MessageProducer` and `MessageConsumer` over an in-process
map of handlers. Lets a single test publish *and* receive without running real Kafka.

### `src/index.ts`
Re-exports all of the above as `@chowdeck/kafka`.

### `src/outbox.test.ts`, `src/consumer.test.ts`
**Vitest** unit tests. They prove: the relay publishes then marks sent; ordering is
preserved; a failed publish re-publishes next run (at-least-once); the full publish→
subscribe loop works via the in-memory bus; duplicates are skipped; and a failed handler
retries. Run with `pnpm --filter @chowdeck/kafka test`.

---

## Part 5 — `apps/identity`

Our **first NestJS service**. It registers users and emits `user.registered`. This is where
the Part 0 concepts become concrete. Folder shape:

```
prisma → drizzle/            generated SQL migrations (drizzle-kit)
drizzle.config.ts            drizzle-kit config (schema path, DB url)
src/
  main.ts                      app entry point (loads .env, then bootstraps)
  app.module.ts                the root module (wires everything)
  health/health.controller.ts  liveness endpoints
  db/                          the real database (MySQL via Drizzle)
    schema.ts                    table definitions (users, outbox_events)
    db.service.ts                connection pool + Drizzle instance
    db.module.ts                 global module providing DbService
  messaging/                   the outbox + producer wiring
    tokens.ts                    DI tokens
    messaging.module.ts          picks adapters, provides them
    drizzle-outbox.store.ts      MySQL-backed OutboxStore (relay reads this)
    relay.runner.ts              background loop that drains the outbox
  users/                       the registration feature
    users.service.ts             business logic (transactional writes)
    auth.controller.ts           HTTP endpoints
    users.module.ts              groups the two above
```

### `package.json`
Name `@chowdeck/identity`. Depends on `@nestjs/common`, `@nestjs/core`,
`@nestjs/platform-express` (the Express HTTP layer), `reflect-metadata` and `rxjs` (Nest
needs both), plus our `@chowdeck/contracts` and `@chowdeck/kafka` via `workspace:*` (the
symlinked internal packages). Scripts: `dev` runs with `tsx watch` (auto-reload), `build`
compiles with `tsc`, `start` runs the compiled `dist/main.js`.

### `src/main.ts` — bootstrapping
```ts
import "reflect-metadata";                       // MUST be first — powers DI
loadEnv({ path: join(__dirname, "../../../.env") }); // load repo-root .env (DB url, etc.)
const app = await NestFactory.create(AppModule); // build the whole app from the root module
app.enableShutdownHooks();                        // let OnApplicationShutdown fire
await app.listen(port);                           // start HTTP server
```
We load the repo-root `.env` with `dotenv` before creating the app, so `process.env` has the
database URL and other config. `NestFactory.create(AppModule)` is the moment Nest reads all
the module metadata, instantiates every provider, resolves the dependency graph, and mounts
controllers.

### `src/app.module.ts` — the root module
```ts
@Module({
  imports: [DbModule, MessagingModule, UsersModule],   // pull in our feature modules
  controllers: [HealthController],                      // mount /health here
})
export class AppModule {}
```
Small on purpose: it just composes the feature modules. `DbModule` and `MessagingModule` are
`@Global()`, so their exports (the `DbService`, the producer, the outbox store) are available
to `UsersModule` without re-importing.

### `src/health/health.controller.ts`
```ts
@Controller("health")
export class HealthController {
  @Get()          check()  { return { service: "identity", status: "ok", ... }; }  // GET /health
  @Get("topics")  topics() { return { topics: Object.values(Topics) }; }           // GET /health/topics
}
```
The `topics` route imports `Topics` from `@chowdeck/contracts` — a deliberate proof that the
shared package is wired in. Note there's no `new` and no manual routing: decorators do it.

### `src/db/schema.ts` — the tables, in TypeScript
Using **Drizzle ORM**, we describe our tables as code:
```ts
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),   // DB enforces uniqueness
  ...
});
export const outboxEvents = mysqlTable("outbox_events", { ... envelope: json("envelope"), sentAt: timestamp("sent_at") });
```
These definitions are the single source of truth: Drizzle derives fully-typed query
functions from them, and `drizzle-kit` derives SQL **migrations** from them.

### `src/db/db.service.ts` — the connection (a provider)
```ts
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  public db!: MySql2Database<typeof schema>;
  async onModuleInit()  { this.pool = mysql.createPool(url); this.db = drizzle(this.pool, { schema }); await this.pool.query("SELECT 1"); }
  async onModuleDestroy() { await this.pool.end(); }
}
```
On startup it opens a MySQL connection pool and builds the Drizzle query interface
(`this.db`), failing fast if the DB is unreachable. Other providers inject `DbService` and
use `dbService.db` to run queries. `db.module.ts` marks it `@Global()`.

> **Migrations:** `drizzle.config.ts` tells `drizzle-kit` where the schema and DB are.
> `pnpm db:generate` writes a numbered `.sql` file under `drizzle/`; `pnpm db:migrate`
> applies pending ones and records them in a `__drizzle_migrations` table — version control
> for the database's shape.

### `src/messaging/tokens.ts`
```ts
export const MESSAGE_PRODUCER = Symbol("MESSAGE_PRODUCER");
export const OUTBOX_STORE     = Symbol("OUTBOX_STORE");
```
Two **injection tokens** (Part 0 §4). We inject *interfaces* (`MessageProducer`,
`OutboxStore`), which don't exist at runtime, so we need tokens as lookup keys. Symbols are
guaranteed-unique, so no accidental clashes. `OUTBOX_STORE` is now provided by
`DrizzleOutboxStore` (backed by the `outbox_events` table); the relay reads through it.

### `src/messaging/messaging.module.ts` — choosing adapters
This is a great example of `useFactory` and tokens working together:
```ts
@Global()          // exported providers are available app-wide without re-importing
@Module({
  providers: [
    { provide: MESSAGE_PRODUCER, useFactory: () =>
        process.env.KAFKA_ENABLED === "true"
          ? new KafkaJsProducer({ ... })   // production
          : new InMemoryProducer() },      // local/dev
    { provide: OUTBOX_STORE, useFactory: () => new InMemoryOutboxStore() },
    { provide: OutboxRelay,
      useFactory: (producer, store) => new OutboxRelay(store, producer, { batchSize: 100 }),
      inject: [MESSAGE_PRODUCER, OUTBOX_STORE] },   // Nest passes these into the factory
    RelayRunner,
  ],
  exports: [MESSAGE_PRODUCER, OUTBOX_STORE, OutboxRelay],
})
export class MessagingModule {}
```
Read it top-down: we register the producer **behind a token**, decided by env; register the
outbox store; build the `OutboxRelay` by **injecting** the previous two into a factory; and
register the `RelayRunner`. `@Global()` means any module can use these exports without
importing `MessagingModule` explicitly.

### `src/messaging/relay.runner.ts` — background work via lifecycle hooks
```ts
@Injectable()
export class RelayRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(MESSAGE_PRODUCER) private producer: MessageProducer,
              private relay: OutboxRelay) {}

  async onApplicationBootstrap() {           // runs once at startup
    await this.producer.connect();
    this.timer = setInterval(() => this.tick(), 1000);   // drain outbox every second
  }
  private async tick() { /* guard against overlap, call this.relay.drain() */ }
  async onApplicationShutdown() { clearInterval(this.timer); await this.producer.disconnect(); }
}
```
This shows lifecycle hooks (Part 0 §5) driving a background loop — no HTTP involved. The
`draining` boolean prevents two drains overlapping if one runs long.

### `src/users/users.service.ts` — the business logic (a provider)
```ts
@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}       // inject the DB

  async register(input) {
    const user = userRegisteredSchema.parse({ userId: randomUUID(), ... });  // validate
    const event = wrapEvent(IdentityEventType.UserRegistered, user, { producer: "identity" });

    // insert user AND outbox row in ONE transaction — both commit or neither does
    await this.dbService.db.transaction(async (tx) => {
      await tx.insert(users).values({ id: user.userId, email: user.email, ... });
      await tx.insert(outboxEvents).values({ id: event.id, topic: Topics.Identity, envelope: event, key: user.userId });
    });
    return user;
  }
}
```
Three things to notice:
1. **Validation** — `userRegisteredSchema.parse(...)` throws on bad data; we catch the
   `ZodError` and rethrow as Nest's `BadRequestException` → a clean `400`.
2. **Atomic transaction** — the user row and its outbox event are written inside one
   `db.transaction(...)`. This is the real, database-enforced version of the outbox
   guarantee: no user without its event, ever.
3. **Unique email** — if the email is taken, MySQL throws `ER_DUP_ENTRY`; we translate that
   to a `ConflictException` → `409`. The database enforces the rule, not us.

### `src/users/auth.controller.ts` — the HTTP surface
```ts
@Controller("auth")
export class AuthController {
  constructor(private users: UsersService,
              @Inject(MESSAGE_PRODUCER) private producer: MessageProducer) {}

  @Post("register")  register(@Body() body) { return { user: this.users.register(body) }; }
  @Get("_published") published() { /* dev-only: peek at what the in-memory producer sent */ }
}
```
`@Body()` hands you the parsed JSON request body. The controller stays thin — it delegates to
the service. `_published` is a dev aid to *see* the outbox→producer flow without Kafka.

### `src/users/users.module.ts`
```ts
@Module({
  controllers: [AuthController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```
Groups the registration feature. It can inject `OUTBOX_STORE`/`MESSAGE_PRODUCER` because
`MessagingModule` is `@Global()` and exports them.

---

## Part 6 — `apps/notifications`

Our **first listener**. Same NestJS shape as identity, so here we highlight only what's new:
consuming events and reacting idempotently. Folder shape mirrors identity, with a
`messaging/` (consumer side) and a `notifications/` feature.

### `package.json`, `main.ts`, `app.module.ts`, `health/health.controller.ts`
Same patterns as identity. `main.ts` listens on `NOTIFICATIONS_HTTP_PORT` (3002). The health
route also reports whether Kafka is `enabled` or `idle`.

### `src/messaging/tokens.ts`
Tokens `MESSAGE_CONSUMER` and `PROCESSED_STORE` — again because we inject interfaces
(`MessageConsumer`, `ProcessedEventStore`).

### `src/messaging/consumer.module.ts`
Like `MessagingModule` but for the consume side. `useFactory` picks `KafkaJsConsumer` (when
`KAFKA_ENABLED=true`) or the idle `InMemoryBus` otherwise, and provides an
`InMemoryProcessedEventStore` behind `PROCESSED_STORE`. It also registers the
`NotificationsController` and `NotificationsService`.

### `src/notifications/notifications.service.ts` — the reaction logic
```ts
@Injectable()
export class NotificationsService {
  private readonly sent = [];
  async dispatch(event) {                       // route by event.type
    if (event.type === IdentityEventType.UserRegistered) await this.sendWelcome(event);
  }
  private async sendWelcome(event) {
    const user = userRegisteredSchema.parse(event.payload);   // validate incoming event
    this.sent.push({ to: user.email, message: `Welcome ...`, eventId: event.id, ... });
  }
}
```
`dispatch` is a small router: a topic can carry many event types, so we branch on
`event.type` and ignore what we don't care about. "Sending" is currently just recording to a
list; real push/SMS/email adapters slot in later.

### `src/messaging/consumer.runner.ts` — subscribing at startup
```ts
@Injectable()
export class ConsumerRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly handler = idempotent(this.processed, e => this.notifications.dispatch(e));

  async onApplicationBootstrap() {
    if (!kafkaEnabled) { this.logger.warn("consumer idle; use /_simulate"); return; }
    await this.consumer.connect();
    await this.consumer.subscribe(Topics.Identity, this.handler);   // wrap = idempotent
    await this.consumer.run();
  }
  async simulate(event) { await this.handler(event); }   // dev endpoint reuses the SAME handler
}
```
Two things to notice:
1. The handler is wrapped with `idempotent(...)` from `@chowdeck/kafka`, so a duplicated
   event is skipped — the safety net for at-least-once delivery.
2. `simulate()` runs the **exact same wrapped handler** the live consumer uses, so the dev
   endpoint is a faithful test, not a separate code path.

### `src/notifications/notifications.controller.ts` — dev endpoints
```ts
@Controller("notifications")
export class NotificationsController {
  @Get("_sent")      sent()       { return { sent: this.notifications.getSent() }; }
  @Post("_simulate") simulate(@Body() body) {
    const event = wrapEvent(IdentityEventType.UserRegistered, {...}, {...});
    if (body.eventId) event.id = body.eventId;   // force id to demo idempotency
    await this.runner.simulate(event);
  }
}
```
`_simulate` fabricates a `user.registered` event and pushes it through the real handler, so
you can watch the listen-and-react flow (and idempotent dedupe) without running Kafka.

---

## Part 7 — Two end-to-end flows

### A) HTTP request: registering a user
1. `POST /auth/register` hits **`AuthController.register`** (identity).
2. It calls **`UsersService.register`**, which validates with the Zod schema, stores the
   user, and **`OutboxStore.save`**s a `user.registered` event — atomically in the real DB.
3. Response returns immediately with the new user.
4. In the background, **`RelayRunner`** ticks every second, **`OutboxRelay.drain`** finds the
   unsent event, and the **producer publishes** it (to Kafka, or records it in-memory).

### B) Event reaction: welcoming the user
1. **`ConsumerRunner`** (notifications) subscribed to the `identity` topic at startup.
2. The `user.registered` event arrives; the **idempotent wrapper** checks it's not a
   duplicate.
3. **`NotificationsService.dispatch`** routes it to `sendWelcome`, which validates the
   payload and records the welcome.
4. A duplicate delivery of the same event id is silently skipped.

Locally (no Kafka), flow A's producer just records in memory (`GET /auth/_published`), and
flow B is triggered via `POST /notifications/_simulate`. With `pnpm infra:up` +
`KAFKA_ENABLED=true`, the two services talk over the real broker end to end.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Module** | A box grouping controllers + providers; the unit Nest wires together. |
| **Controller** | Class whose methods handle HTTP routes (`@Get`, `@Post`, …). |
| **Provider / Service** | `@Injectable()` class holding logic; supplied via DI. |
| **Dependency Injection (DI)** | Nest creates and passes dependencies into constructors for you. |
| **IoC container** | The Nest subsystem that builds and stores all providers. |
| **Token** | A unique key (Symbol/string) to register/inject a value — needed for interfaces. |
| **`useFactory`** | Provider form where a function builds the value (with `inject`ed deps). |
| **`@Global()`** | Makes a module's exports available everywhere without importing it. |
| **Lifecycle hook** | Method Nest calls at a phase (`onApplicationBootstrap`, `onApplicationShutdown`). |
| **Decorator** | `@Something` metadata attached to a class/method/param that Nest reads. |
| **Port / Adapter** | An interface (port) with swappable implementations (adapters) — how `libs/kafka` stays broker-agnostic. |
| **Outbox** | Save event + state in one transaction; a relay publishes it later. Reliable events. |
| **Idempotent** | Doing it again has no extra effect — how we survive at-least-once delivery. |
| **Zod** | Library for schemas that validate at runtime *and* produce TypeScript types. |
