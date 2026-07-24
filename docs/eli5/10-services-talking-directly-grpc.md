# ELI5 #10 — Services Phoning Each Other Directly (gRPC)

## Two kinds of conversation

Our platform has two *very* different kinds of conversation:

1. **Outside → us.** Your phone talks to the platform. This should be simple, universal, and
   work from any device: that's **REST/JSON through the gateway** (docs #6–#9).
2. **Us → us.** One of our own services needs something from another — e.g. at checkout the
   **order** service must ask **catalog**, "what do these dishes actually cost?" Nobody
   outside ever sees this conversation.

For that second kind, the big players don't use plain HTTP/JSON. They use **gRPC**. This doc
introduces gRPC using the first place we need it: order asking catalog for prices.

## What is gRPC, really?

gRPC lets one service call a function **that lives in another service** as if it were a local
function:

```text
order:   const prices = await catalog.getItems([id1, id2]);
                                  └── actually runs INSIDE the catalog service, over the network
```

You call `getItems(...)`, and gRPC handles shipping the request across the network, running
it in catalog, and shipping the answer back. That's why it's called a **Remote Procedure
Call** — a procedure (function) that runs remotely.

## The contract: a `.proto` file 📜

Before two services can talk, they must agree on **exactly** what can be said. That agreement
is a **`.proto` file** — a small, language-neutral description of the available functions and
the shape of their messages. Ours (`libs/contracts/proto/catalog.proto`) says:

```proto
service Catalog {
  rpc GetItems(GetItemsRequest) returns (GetItemsResponse);
}

message CatalogItem {
  string id = 1;
  string vendor_id = 2;
  int64  price_kobo = 4;   // money in kobo, of course
  bool   is_available = 5;
}
```

Think of it as the **menu of phone calls** catalog will accept, plus the exact form of every
question and answer. Both sides read this one file, so they can never disagree about the
shape of the data. Those numbers (`= 1`, `= 2`) are permanent field IDs — that's the trick
that lets the contract grow later without breaking old callers.

## Why not just use HTTP/JSON internally?

For internal, high-traffic, service-to-service calls, gRPC brings three wins:

- **A real contract.** The `.proto` is shared code. Change a field and both sides' types
  update together — mismatches are caught when we build, not in production.
- **Faster & smaller.** Messages travel as compact **binary** (Protobuf), not chunky text
  JSON, over a persistent **HTTP/2** connection. At thousands of checkouts a second, that
  adds up.
- **It reads like a function call.** `catalog.getItems(ids)` — no URLs, no hand-written
  `fetch`, no remembering which path returns what.

The trade-off: a `.proto` and a bit more setup. Worth it *inside* the mesh; overkill at the
public edge (where REST's universality wins). So we use **both, on purpose** — REST outside,
gRPC inside. (See decision **D8** in `ARCHITECTURE.md`.)

## What we built in this step

Catalog now runs **two front doors at once** (a "hybrid" app):

```text
   phone/app ──REST :3003───►  catalog  (browse menus, as before)
   order svc ──gRPC :50051──►  catalog  (GetItems — internal only)
```

- The REST side is unchanged.
- A new **gRPC server** answers `GetItems(ids)` → returns each item's id, vendor, price
  (in kobo), and availability. Unknown ids are simply left out of the answer.
- We use the **runtime proto-loader** approach: the service reads the `.proto` file when it
  starts — no separate code-generation step to run. We hand-write matching TypeScript types
  in `@chowdeck/contracts` so our code stays fully typed.

Next step (the order service) will be the **client** that dials this number at checkout, so a
customer can never invent their own price. 🛒

## See it yourself

There's no browser for gRPC (it's not meant for humans), but you can call it with a tiny
script or a tool like `grpcurl`. When catalog is running:

```bash
# list the services the gRPC server exposes (if grpcurl is installed)
grpcurl -plaintext localhost:50051 list

# call GetItems with a real item id
grpcurl -plaintext -d '{"ids":["<itemId>"]}' \
  localhost:50051 chowdeck.catalog.v1.Catalog/GetItems
```

We verified exactly this: the same item that REST reports at `priceKobo: 300000` comes back
identically over gRPC — proving both doors read the one source of truth. 🔌

## One gotcha worth remembering

In Protobuf, an **empty list comes back as "nothing"**, not as an empty array. So a
`GetItems` call that matches no ids gives you `items: undefined`, not `items: []`. Callers
should treat them the same (`res.items ?? []`). It's a classic first-day-with-gRPC surprise.
