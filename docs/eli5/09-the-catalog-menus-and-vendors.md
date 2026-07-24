# ELI5 #9 — The Menu Board (Catalog Service)

## What it's for

Before anyone can order food, the app needs to know **who's cooking** and **what's on the
menu**. That's the **catalog service** — the big menu board for the whole platform:

- **Vendors** — the restaurants/stores (e.g. "Mama Put Kitchen").
- **Menu items** — the dishes each vendor sells (e.g. "Jollof Rice + Chicken — ₦2,500").

It's its own little program with its **own database** (`chowdeck_catalog`), completely
separate from the identity service's database. That's the "database per service" rule: each
program owns its data and nobody reaches into anyone else's cupboard.

## Two kinds of visitors

The catalog has to serve two very different people, so we split the doors:

- 🍽️ **Hungry customers just looking** — they can **read** the menu freely. Browsing
  vendors and dishes needs **no login**. (In shop terms: anyone can walk in and read the
  menu on the wall.)
- 🧑‍🍳 **Someone changing the menu** — adding a vendor, adding a dish, changing a price or
  marking something sold-out **requires a login token**. (Only staff can rewrite the board.)

The clever part: the **gateway** enforces this by **HTTP method**. `GET /catalog/...`
(reading) is public; `POST`/`PATCH` (writing) must carry a valid wristband. One rule, added
in one place — the catalog service itself doesn't have to worry about it.

```text
  anyone ───GET /catalog/vendors────►  ✅ allowed (just reading)
  anyone ───POST /catalog/vendors───►  🚫 401 (need a token to change the menu)
  logged-in ─POST + Bearer token────►  ✅ allowed
```

## Money is counted in kobo 🪙

A dish price is stored as **`priceKobo`** — a whole number of **kobo**, not naira with a
decimal point. ₦2,500 is stored as `250000`. Why? Because computers are famously bad at
`0.1 + 0.2` (you get `0.30000000000000004`). By only ever using whole numbers, our money
math is always exact — no mystery half-kobo. Every service on the platform follows this same
rule.

## Little safety checks

- A dish must belong to a **real vendor** — try to add one to a vendor that doesn't exist and
  you get a **404**, not a broken orphan record.
- Prices must be **positive whole numbers** within a sane range → bad input is a clean
  **400**, never a database explosion.
- Each vendor gets a **slug** (a URL-friendly handle like `mama-put-kitchen`). If you don't
  supply one, the service makes it from the name. Two vendors can't share a slug → **409**.
- An **empty edit** (`PATCH` with no fields) is rejected — you have to actually change
  something.

## See it yourself (everything through the gateway on :3000)

```bash
# browse — no login needed
curl http://localhost:3000/catalog/vendors

# log in first to get a token (see doc #7), then create a vendor
curl -X POST http://localhost:3000/catalog/vendors \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Mama Put Kitchen","description":"Best jollof in Lagos"}'

# add a dish (₦2,500 = 250000 kobo)
curl -X POST http://localhost:3000/catalog/vendors/<vendorId>/items \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jollof Rice + Chicken","priceKobo":250000}'

# mark it sold out — still needs the token
curl -X PATCH http://localhost:3000/catalog/items/<itemId> \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' \
  -d '{"isAvailable":false}'
```

## What's next

The catalog is the shelf; the **ordering service** (next) is the checkout — it will read
prices *from* the catalog to build an order total (in kobo, of course), so a customer can
never invent their own price. 🛒
