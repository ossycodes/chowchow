# ELI5 #2 — The Monorepo & Microservices

## One big toy box, many small toys

We keep **all our code in one folder** (called a **monorepo** — "mono" = one, "repo" =
storage box). But inside, the code is split into **many small programs**, each doing one
job.

Think of a LEGO box:
- The **box** = the monorepo (everything lives together, easy to find).
- Each **LEGO set** = one microservice (one job, snaps together with the others).

## What's in our box right now

```
apps/         ← the small programs ("services"), each runs on its own
  identity/     handles sign-up & who-you-are  ✅ built
libs/         ← shared pieces every program can borrow
  contracts/    the "shared dictionary" of messages  ✅ built
  kafka/        the "post office" tools for sending messages  ✅ built
infra/        ← the helper machines (database, cache, message post office)
docs/         ← explanations (like this one!)
```

## Why split into small programs?

Imagine one **giant** program that does *everything*. If one part breaks, the whole thing
falls over — like one huge tower of blocks. And if lots of people order at once, you
can't make just the "cooking" part bigger; you have to grow the whole tower.

With **small programs**:
- If the "ratings" program hiccups, people can still **order and pay**. 👍
- When dinner-time rush hits, we can add more copies of *just* the busy program. 📈
- Different teams can work on different programs without bumping into each other.

## The "shared dictionary" (contracts)

When programs talk to each other, they must **agree on the words**. If one says "cost" and
another expects "price", they get confused. So we made one place, `libs/contracts`, that
holds the **exact shape of every message**. Everyone reads from the same dictionary, so
nobody misunderstands.

Money always lives as a **whole number of kobo** (like counting in pennies, never
₦12.50) so we never get rounding mistakes.

## The tools we use (in kid words)

- **pnpm** = the helper that fetches and organizes all the little code pieces we borrow.
- **Turborepo** = the smart builder that knows the right **order** to build things (build
  the shared pieces first, then the programs that use them) and skips work it already did.
- **NestJS** = the "skeleton" each program is built on, so they all look and behave alike.
- **Docker** = little **pretend computers** that run our database and post office on your
  laptop, so you don't have to install them for real.

## Proof it works

We built the first program (`identity`) and asked it "are you alive?" — and it answered
"ok". We also asked it to list the message topics from the shared dictionary, and it did.
That proved the box, the shared pieces, and the program all snap together correctly. ✅
