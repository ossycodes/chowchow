# ELI5 #6 — Guarding the Doors (Validation)

## The problem: never trust what comes in

Anything sent to our API comes from the outside world — a phone app, a script, or someone
poking at it on purpose. If we just believe whatever arrives, bad things happen:

- Someone sends `email: "banana"` → we try to save nonsense.
- Someone sends a 10,000-character email → the database chokes and throws an ugly error.
- Someone sends `actorType: "admin"` → uh oh, they just made themselves an **admin**. 😱

So before we act on **any** request, we check it at the door — like a bouncer checking IDs.
This checking is called **validation**.

## The bouncer: a reusable validation pipe

We built one bouncer we can reuse everywhere: `ZodValidationPipe` (in the new
`@chowdeck/nest` toolbox). You hand it a **guest list** (a schema describing what valid
input looks like), and it checks every request against it:

- Input matches the rules? ✅ It passes through, cleaned up.
- Input breaks a rule? 🚫 It's rejected immediately with a clear **400** ("Bad Request")
  message saying exactly what's wrong — the request never reaches our real code.

It also **strips off anything not on the guest list**. So if someone sneaks in an extra
field like `isAdmin: true`, it's simply thrown away. Only the fields we expect get through.

## The three big fixes

**1. Real rules for registration.** The register "guest list" now says: email must look
like an email **and** be at most 255 characters; phone (if given) must be 7–15 digits. So
garbage and giant values bounce at the door with a friendly 400 — instead of sneaking in
and crashing the database with a confusing 500.

**2. Closing the "make me an admin" hole.** 🔒 Public sign-up **no longer accepts**
`actorType` at all. Everyone who self-registers becomes a plain **customer**, full stop.
(Vendors, riders, and admins will be created through separate, permission-checked doors
later.) We tested this: sending `actorType: "admin"` came back as `customer`.

**3. Checking the keys before starting the car.** When a service starts up, it now checks
its **settings** (environment variables) first. If something important is missing or wrong —
like a broken database address — it prints a clear message and **refuses to start**, instead
of starting up and mysteriously breaking later. Fail loud, fail early.

## The new shared toolbox: `@chowdeck/nest`

We put the bouncer (`ZodValidationPipe`) and the startup-settings checker (`validateEnv`) in
a new shared library, `@chowdeck/nest`, so **every** service — present and future — uses the
exact same guards. Write the safety once, reuse it everywhere.

## Why validation ≠ permission

A subtle but important point: validation asks *"is this input well-formed?"* — it does **not**
ask *"are you allowed to do this?"* (that's **authorization**, coming with the API gateway).
Forcing `actorType: customer` is us not even *offering* the dangerous option at this door; a
proper "who are you and what may you do?" check is a separate guard we'll add next.

## See it yourself

```bash
# bad email → 400 with a clear message
curl -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' -d '{"email":"nope"}'
# → {"statusCode":400,"error":"Bad Request","message":["email: Invalid email"]}

# try to become admin → you're a customer, and isAdmin is stripped
curl -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"sneaky@example.com","actorType":"admin","isAdmin":true}'
# → {"user":{"...","actorType":"customer","email":"sneaky@example.com"}}
```

We ran exactly these and got exactly these results. The doors are guarded. 🛡️
