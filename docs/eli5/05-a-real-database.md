# ELI5 #5 — A Real Database

## Before now: writing on sticky notes

Until this point, the identity service kept users in a **`Map` in memory** — like jotting
names on sticky notes on your desk. Fast, but the moment the program stops, **every sticky
note is thrown away**. Not a real app.

Now we gave identity a **real filing cabinet**: a **MySQL database**. When someone signs
up, their record is written to disk and stays there forever — restart the program, it's
still there. ✅

## The pieces

- **MySQL** — the filing cabinet (runs in Docker, started with `pnpm infra:up`).
- **Drizzle** — our helper for talking to the cabinet in TypeScript. Instead of writing raw
  database commands, we describe our tables in code and Drizzle gives us safe, typed
  functions to read and write. (We first planned to use a tool called Prisma, but Prisma
  needs to download an extra program from the internet, and this computer's network blocks
  that download — so we used Drizzle, which needs no download and is just as good.)
- **Two tables** in the `chowdeck_identity` database:
  - `users` — one row per person.
  - `outbox_events` — the "to-be-mailed basket" from [doc #3](03-events-and-the-outbox.md),
    now a real table instead of an in-memory list.

## The most important part: doing two things as one 🔗

Remember the outbox problem: we must save the **user** AND the **announcement** together —
never one without the other.

A real database gives us a superpower for this called a **transaction**. Think of it as a
**"both or nothing" box**: you put two actions in the box, and the database promises that
either **both** happen, or if anything goes wrong, **neither** does — it rewinds like they
never happened.

So registration does this inside one transaction box:

1. Insert the new user.
2. Insert the outbox announcement.

If the computer trips over its own feet between step 1 and step 2, the database **undoes**
step 1 too. You can never end up with a user who has no announcement. This is the outbox
pattern working for real. 🎯

## Bonus: no two people with the same email

We told the database that `email` must be **unique**. So if someone tries to sign up with
an email that's already taken, the database **refuses**, and our service politely replies
"email already registered" (a `409` response). We don't have to check for duplicates
ourselves — the filing cabinet enforces it.

## "Migrations" — changing the cabinet's shape safely

When we change what our tables look like (add a column, a new table…), we don't hand-edit
the live database. We write the change as a **migration** — a numbered instruction file.
Running the migrations brings any database (your laptop, a teammate's, production) to the
exact same shape, in the same order. It's version control for the database. We used
**drizzle-kit** to generate and apply the first migration that created our two tables.

## See it for real

```bash
pnpm infra:up            # start MySQL (and friends)
cd apps/identity && pnpm db:migrate   # create the tables
node dist/main.js        # run the service (after `pnpm build`)

curl -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' -d '{"email":"ada@example.com"}'
```

Then peek inside the actual database:

```bash
docker exec chowdeck-mysql mysql -uroot -proot \
  -e "USE chowdeck_identity; SELECT email FROM users; SELECT topic, sent_at FROM outbox_events;"
```

We ran exactly this: ada's row was in `users`, her `user.registered` row was in
`outbox_events`, and a second later the relay stamped its `sent_at` (meaning "announced").
Registering ada twice gave a `409`. All persisted to disk. 🗄️

## Why this matters

Every service that owns data (catalog's menus, orders, the money ledger) will use this same
pattern: its own database, transactions for "both-or-nothing" safety, unique rules the
database enforces, and migrations to evolve safely. Identity is now the **template** the
others copy.
