# 27. Real Roads and "When Will It Arrive?" — road distance & ETA

## The problem

Back in doc #24 we made the delivery fee fair by charging for **distance**. But we
measured that distance "as the crow flies" — a perfectly straight line from the
restaurant to your house.

Roads aren't straight. There are rivers, one-way streets, and that giant market you
can't drive through. The real driving distance is always a bit longer than the straight
line. And the straight line tells you nothing about **how long** the trip will take —
which is the one thing every hungry customer actually wants to know: _"when will my food
get here?"_

## The idea

We taught the order service to ask a **map** two questions about the route from the
restaurant to your door:

1. **How far is the drive?** (real road kilometres)
2. **How long will it take?** (an ETA in minutes)

We use the answer to #1 for the delivery fee (same fair formula as before, just with a
better number), and we save the answer to #2 on the order so we can show you an ETA.

## Two kinds of map

We didn't want to _force_ everyone to sign up for a paid maps service just to run the
project on their laptop. So we made "the map" a swappable part — a **port** — with two
plug-ins behind it:

- **Haversine (the default, offline).** No internet, no API key. It takes the straight
  line and multiplies it by a "road factor" (1.3 — roads are ~30% longer than the crow
  flies), then estimates time from an average city speed (25 km/h). It's an educated
  guess, but a good one, and it works anywhere.

- **OSRM (the real deal, opt-in).** OSRM is a free routing engine. Point us at an OSRM
  server (`DISTANCE_PROVIDER=osrm` + `OSRM_URL`) and we ask it for the _actual_ driving
  route — real distance, real duration.

You switch between them with one environment variable. Nothing else in the app changes.

## The golden rule: a map outage must never block dinner

What if the maps server is down, or slow, or has no route? We do **not** fail the order.
The OSRM plug-in gives up after a short timeout and returns "I don't know" (`null`), and
checkout quietly falls back to the **flat delivery fee** — exactly what it did before we
had distance at all. Orders keep flowing; you just don't get the fancy distance-based
price for that one order.

## What you see now

Place an order with a delivery location and the order comes back with an `etaMinutes`
field — "about 15 minutes." That number rides along on the order the same way the price
and status do.

## Where it lives

- `apps/order/src/orders/distance/distance-provider.ts` — the port (the "ask the map" contract)
- `.../distance/haversine-distance.provider.ts` — the offline default
- `.../distance/osrm-distance.provider.ts` — the real routing plug-in
- `.../distance/distance.module.ts` — picks one based on `DISTANCE_PROVIDER`
- `apps/order/src/orders/orders.service.ts` — checkout asks for the route, uses km for the fee, saves the ETA
- New order column: `eta_minutes`

## The takeaway

Hide the hard, expensive, or optional thing (a real maps API) behind a small contract,
and ship a free default that works everywhere. You get real road distance and ETAs when
you want them, a laptop-friendly approximation when you don't, and an order flow that
never breaks just because a map service hiccuped.
