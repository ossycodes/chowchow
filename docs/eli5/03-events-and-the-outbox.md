# ELI5 #3 — Events & the Outbox

## The problem: how do the small programs tell each other stuff?

Say a new customer signs up in the **identity** program. Other programs care about this:
- **notifications** wants to send a "welcome!" message.
- **promotions** wants to give a first-order discount.

The identity program **shouldn't have to know** about all of them. That would be like the
new kid having to personally run around and tell every teacher they arrived. Messy!

## The idea: announce it once, on a loudspeaker

Instead, identity just **shouts one announcement**: *"Hey everybody, a user registered!"*
Whoever cares is listening. This announcement is called an **event**.

The **loudspeaker system** is called **Kafka** (we use a look-alike called **Redpanda**
on our laptops). Programs **publish** (shout) events, and other programs **subscribe**
(listen). Nobody has to know each other personally. 📢

Every announcement comes in a standard **envelope** so everyone can read it:

```
who sent it? → identity
what happened? → user.registered
when? → 2026-07-23T09:28:10Z
a unique sticker id → 2a8d8663-...   (this matters — see below!)
the details → { userId, email, ... }
```

## The tricky part: don't lose the announcement 😬

Here's a sneaky bug that catches lots of real apps:

1. Save the new user to the database. ✅
2. Shout the announcement... but the loudspeaker is down for a second. ❌

Now we have a user who exists but **nobody was told**. Their welcome message and discount
never happen. Bad!

Or the opposite: we shout first, then the database save fails. Now everyone thinks a user
exists who **doesn't**. Also bad!

## The fix: the "Outbox" (a to-be-mailed basket)

Real post offices don't hand you the mail the instant you write it. You drop your letter
in an **outbox basket**, and a mail carrier picks it up later.

We do the same:

1. In **one single step**, we save *both* the new user **and** a note in an "outbox"
   basket that says "announce this." Because it's one step, either **both** happen or
   **neither** does. No half-done mess. 🧺
2. A little worker (the **relay**) checks the basket **every second**. Any notes it finds,
   it shouts on the loudspeaker, then ticks them off as "mailed."

If the loudspeaker is down when the worker checks? No problem — the note **stays in the
basket** and gets shouted on the next check. The announcement is never lost.

## "At least once" and the unique sticker

Because the worker shouts **first** and ticks off **second**, there's a tiny chance it
shouts a note, then crashes before ticking it off — so it shouts that same note **again**
next time. That means every announcement is heard **at least once**, sometimes twice.

That's fine! Every announcement has a **unique sticker id**. Listeners remember stickers
they've already handled, so a repeat is simply ignored. Better to hear something twice than
to miss it. 🎫

## What we actually built

- `libs/kafka` — the post-office tools: the **envelope maker**, the **loudspeaker**
  (with a real-Kafka version *and* a pretend in-memory version for testing), and the
  **outbox basket + relay worker**.
- `identity` now, on sign-up, drops a `user.registered` note in the outbox, and the relay
  shouts it a second later.

## See it with your own eyes

```bash
# start the identity program, then:
curl -X POST http://localhost:3001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com"}'

# wait ~1 second for the relay, then peek at what got shouted:
curl http://localhost:3001/auth/_published
```

You'll see the `user.registered` envelope that was published. In the server log you'll see
`relay published 1 event(s)`. That's the whole flow working. 🎉

## Why this matters for Chowdeck

This exact pattern is how the **order** will flow later: "order paid" → the dispatch
program hears it and finds a rider; "rider assigned" → the customer's app hears it and
shows the bike moving. Getting the "never lose a message" plumbing right **now** means the
important stuff (orders and money) is reliable **later**.
