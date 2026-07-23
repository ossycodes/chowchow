# ELI5 #4 — The Notifications Service (Listening for Events)

## The story so far

In [doc #3](03-events-and-the-outbox.md), the **identity** program learned to **shout**
an announcement on the loudspeaker whenever someone signs up: *"user registered!"*

But shouting into an empty room does nothing. Somebody has to **listen and act**. That's
what we built now: the **notifications** program. It's the first **listener**. 👂

## What it does

The notifications program sits quietly with its ear to the loudspeaker. The moment it
hears *"user registered! (here's their email)"*, it springs into action and **sends a
welcome message**: *"Welcome to Chowdeck! Your first delivery is on us."* 🎉

Right now "sending" just means writing it down in a list (so we can see it worked). Later
we'll plug in real channels — actual push notifications, SMS, and email.

## The important trick: don't say "welcome" twice 🙅

Remember from doc #3: the loudspeaker promises to deliver each announcement **at least
once** — which means *sometimes twice*. If we're not careful, a new user could get **two**
welcome messages. Annoying!

So the listener keeps a little **guest list of stickers it has already handled**. Every
announcement has a unique sticker id. When one arrives, the listener checks:

- Sticker I've never seen? → do the welcome, and add the sticker to the list. ✅
- Sticker already on the list? → ignore it, I already did this one. 🚫

This "do-it-only-once" rule is called **idempotency** (fancy word, simple idea: doing it
again changes nothing).

And if the welcome **fails** (say the email server is down)? The listener **peels the
sticker back off** the list, so the announcement can be tried again later. Better to retry
than to lose it.

## New tools we added to the "post office" kit

The `libs/kafka` toolbox got its **listening** half (before it could only shout):

- **Consumer** — the "ear" that subscribes to a topic and runs a handler for each message
  (a real Kafka version, plus a pretend one for tests).
- **Idempotency helper** — the guest-list-of-stickers logic described above.
- **In-memory bus** — a tiny pretend loudspeaker that works **inside one program**, so our
  automated tests can shout AND listen without needing the real Kafka machine running.

## See it work — no Kafka needed

The notifications program has a **practice button** (`/_simulate`) that pretends an event
arrived, running the exact same listener code:

```bash
# start notifications, then:

# pretend a user signed up → welcome sent
curl -X POST http://localhost:3002/notifications/_simulate \
  -H 'Content-Type: application/json' -d '{"email":"ada@example.com"}'

# pretend the SAME announcement arrives twice (same sticker "evt-1")
curl -X POST http://localhost:3002/notifications/_simulate \
  -H 'Content-Type: application/json' -d '{"email":"chidi@example.com","eventId":"evt-1"}'
curl -X POST http://localhost:3002/notifications/_simulate \
  -H 'Content-Type: application/json' -d '{"email":"chidi@example.com","eventId":"evt-1"}'

# see what was sent — chidi appears ONCE, not twice
curl http://localhost:3002/notifications/_sent
```

We ran exactly this: ada got a welcome, chidi got **one** welcome even though we sent his
announcement twice. Idempotency working. 🎯

## The full picture now

```
[identity]  --shouts-->  (loudspeaker)  --heard by-->  [notifications]
 "user registered"          Kafka                       "send welcome" (once!)
```

For real (across two separate programs), start the loudspeaker with `pnpm infra:up` and
set `KAFKA_ENABLED=true`. Without it, each program uses its pretend in-memory version, and
you use the practice button to see the listener work.

## Why this matters

This is the **same shape** as the important stuff coming later:

- *"order paid"* → the **dispatch** program hears it → finds a rider.
- *"rider assigned"* → the **customer app** hears it → shows the moving bike.

We just proved the listen-and-react pattern end to end — including the tricky "don't do it
twice" part — on something safe (welcome messages) before we rely on it for orders. 🚀
