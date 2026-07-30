# ELI5 #25 — A Real Payment Provider (Webhooks)

## Fake vs. real payment

Until now, paying was **instant and pretend**: the fake provider said "✅ paid!" the moment we
asked, and the order flipped to PAID immediately. Real payment providers (like **Paystack**)
don't work that way — and pretending they do would hide the trickiest part of taking money.

Real payments are **asynchronous**:

```text
  1. we ASK the provider to start a charge  → it gives us a link ("pay here")
  2. the customer pays on the provider's page (their bank, card, OTP…)   ⏳
  3. LATER, the provider calls US back — a "webhook" — to say "that one succeeded"
```

Between steps 1 and 3 the payment sits **PENDING**. The money isn't confirmed until the
webhook arrives. This PR models that real flow.

## Two-step charge ✋…✅

- **Start (initialize):** on `order.created`, payments records a **PENDING** payment and asks
  the provider to start the charge. Paystack returns an **authorization URL** — where the
  customer would go to pay. The order does **not** become PAID yet.
- **Confirm (webhook):** when the customer finishes paying, the provider POSTs a **webhook** to
  us. We finalize the payment → `payment.succeeded` → the order flips to PAID (the same
  downstream flow as before).

The fake provider still exists for local dev: it just settles in step 1 (returns "succeeded"
instantly), so you don't need a webhook to see PAID. You pick which one with
`PAYMENT_PROVIDER=fake` (default) or `paystack`.

## Don't trust a webhook — *verify* it 🔐

A webhook is just an HTTP request hitting a **public** URL. Anyone could POST a fake
"charge.success" and get a free meal! So the provider **signs** every webhook: it computes an
HMAC (a fingerprint) of the exact request body using a **secret only it and we know**
(`PAYSTACK_SECRET_KEY`), and sends it in the `x-paystack-signature` header.

We recompute that fingerprint over the **raw bytes** we received and compare. Match → genuine.
No match → we **reject it (400)** and do nothing. (We compare in constant time so we don't leak
hints about the secret.) That's why the webhook endpoint can be public and unauthenticated —
the **signature is the auth**, not a login token.

> Because it needs the *exact* bytes that were signed, the payments app is created with
> `rawBody: true`, and the gateway forwards the webhook untouched (and marks just
> `/payments/webhook` as public — every other payments route still needs your JWT).

## See it yourself

```bash
# run payments in paystack mode
PAYMENT_PROVIDER=paystack PAYSTACK_SECRET_KEY=sk_test_x KAFKA_ENABLED=true \
  node apps/payments/dist/main.js

# checkout → the payment is PENDING with an authorization URL; the order stays CREATED
curl http://localhost:3000/payments/order/<orderId> -H "Authorization: Bearer <token>"
#   → { status: "PENDING", authorizationUrl: "https://checkout.paystack.com/..." }

# simulate the provider's signed webhook (HMAC-SHA512 of the body with the secret):
#   POST /payments/webhook  x-paystack-signature: <hmac>
#   body: {"event":"charge.success","data":{"reference":"<orderId>","status":"success"}}
# → 200, payment SUCCEEDED, order → PAID.  A wrong signature → 400, nothing happens.
```

We verified exactly this: at checkout the payment stayed **PENDING** (order still CREATED); a
webhook with a **bad** signature was **rejected (400)**; and only the **correctly-signed**
webhook finalized the payment and drove the order to **PAID**. 🔒✅

## What's still simplified

The `paystack` adapter doesn't actually call Paystack's HTTP API to create the transaction
(no live keys / no network here) — it returns a synthetic reference + URL. **Webhook
verification, though, is the real algorithm.** Dropping in the real API call (one HTTP POST in
`initialize`) is all that's left to go live.
