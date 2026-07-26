# ELI5 #12 — How the Order Service *Calls* Catalog (gRPC, up close)

Doc #10 explained what gRPC **is**. This one zooms into the confusing bit: **how, in code,
the order service actually calls catalog** — the four little files in
`apps/order/src/catalog/` and how they hand off to each other.

## The one-sentence idea

> The order service wants to call `catalog.getItems(ids)` **as if it were a normal local
> function** — even though that function really runs in a *different program* on the network.
> gRPC + NestJS create that illusion. The four files exist only to set the illusion up
> cleanly.

## Why four files? (the "restaurant phone" analogy ☎️)

Imagine the order service needs to phone the catalog to ask for prices. To do that neatly it
keeps four things:

| File | Role | Everyday analogy |
|------|------|------------------|
| `catalog.tokens.ts` | **name tags** | Labels on a keyring so you can find the right key |
| `catalog-price-reader.ts` | **the port** (an interface) | A sticky note: *"I need someone who can answer: what do these items cost?"* — doesn't say **how** |
| `catalog.grpc-client.ts` | **the adapter** | The actual person who picks up the phone and makes the gRPC call |
| `catalog.module.ts` | **the wiring** | The office manager who installs the phone line and says "route price questions to that person" |

The whole point of the split: **the checkout code only ever sees the sticky note (the port).**
It never knows a phone (gRPC) is involved. So if we later replace the phone with, say, carrier
pigeons (a different transport), checkout doesn't change one line. This is the
**ports-and-adapters** pattern.

## File by file

### 1. `catalog.tokens.ts` — just name tags

```ts
export const CATALOG_PRICE_READER = Symbol("CATALOG_PRICE_READER");
export const CATALOG_GRPC_CLIENT  = Symbol("CATALOG_GRPC_CLIENT");
```

NestJS finds dependencies by a **token** (a name tag). These two Symbols are those tags —
one for the port, one for the raw gRPC phone line. No logic here at all.

### 2. `catalog-price-reader.ts` — the port (the "what", not the "how")

```ts
export interface CatalogPriceReader {
  getItems(ids: string[]): Promise<CatalogItemMessage[]>;
}
```

This is the *only* thing the order domain depends on. It says **what** order needs ("give me
items by id") and deliberately says **nothing** about gRPC. It's the sticky note.

### 3. `catalog.grpc-client.ts` — the adapter (the only file that touches gRPC)

This class *implements* the port using an actual gRPC call. Two steps:

**On startup**, grab the remote service object from the phone line:

```ts
onModuleInit() {
  this.catalog = this.client.getService<CatalogGrpc>(CATALOG_SERVICE_NAME);
}
```

`this.client` is the phone line NestJS built for us. `getService("Catalog")` reads the shared
`.proto` and hands back an object that **magically already has a `getItems` method** — NestJS
generated it from the contract; we never wrote its body.

**When checkout calls it**, make the actual call:

```ts
async getItems(ids) {
  const res = await firstValueFrom(this.catalog.getItems({ ids }));
  return res.items ?? [];           // proto3: empty list → undefined (doc #10 gotcha)
}
```

`this.catalog.getItems({ ids })` — **this single line is the network call.** It *looks* like a
plain method call, but underneath gRPC packs `{ ids }` into binary, ships it over HTTP/2 to
`localhost:50051`, catalog runs it, and ships the answer back. (`firstValueFrom` just turns
the Observable gRPC returns into a normal awaitable Promise.)

### 4. `catalog.module.ts` — the wiring (where it all clicks together)

Two jobs:

**a) Build the phone line** and store it under the `CATALOG_GRPC_CLIENT` tag:

```ts
ClientsModule.register([{
  name: CATALOG_GRPC_CLIENT,
  transport: Transport.GRPC,
  options: {
    package:   CATALOG_PACKAGE,      // which package inside the .proto
    protoPath: CATALOG_PROTO_PATH,   // the shared contract (so it knows the methods)
    url:       "localhost:50051",    // WHERE catalog's gRPC server listens
    loader:    { longs: Number },    // int64 price → JS number
  },
}])
```

**b) The crucial glue line:**

```ts
{ provide: CATALOG_PRICE_READER, useClass: CatalogGrpcClient }
```

Read it as: *"whenever any code asks for the port (`CATALOG_PRICE_READER`), give them a
`CatalogGrpcClient`."* This is what connects **what checkout asks for** (the sticky note) to
**who actually does the work** (the gRPC adapter).

## Putting it together: one real checkout call

In `orders.service.ts`, checkout asks for the **port** and calls **one method**:

```ts
constructor(
  @Inject(CATALOG_PRICE_READER) private readonly catalog: CatalogPriceReader,
) {}
...
const priced = await this.catalog.getItems(ids);   // ← looks totally local
```

It has **zero** idea that gRPC, a `.proto`, or a network hop is involved. Here's what actually
happens beneath that innocent line:

```text
orders.service.ts            catalog.grpc-client.ts          THE WIRE           catalog service
─────────────────            ──────────────────────         ──────────         ───────────────
this.catalog.getItems(ids) ─► getItems(ids)
   (via the PORT)               this.catalog.getItems({ids}) ─gRPC/HTTP2─►  CatalogGrpcController.getItems
                                                              :50051            (the server, doc #10)
                                                                                   ↓ reads MySQL
  CatalogItem[]  ◄──────────── res.items ?? []          ◄─────────────────────  { items: [...] }
```

NestJS quietly substituted the `CatalogGrpcClient` adapter for the port because of that one
`useClass` line in the module. That's the whole trick.

## The mental model to keep

1. **module** wires the phone line and says "route the port to the gRPC adapter,"
2. **checkout** asks for the *port* and calls `getItems`,
3. NestJS secretly hands over the **gRPC adapter**,
4. the adapter's **one line** (`this.catalog.getItems(...)`) is the real remote call.

And because checkout only ever touched the *port*, the day we swap gRPC for something else, we
write a new adapter and change **one line** in the module — checkout never notices. 🔌
