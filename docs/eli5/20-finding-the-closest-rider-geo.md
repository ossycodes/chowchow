# ELI5 #20 — Finding the *Closest* Rider (Geo Matching)

## The upgrade

When an order is ready, dispatch picks a rider (doc #13). Originally it just grabbed the
next available one — fair, but not smart: a rider across the city might get a pickup that's
right next to someone else. Now dispatch picks the **nearest** rider to the restaurant. That
means faster pickups and less driving. 🛵📍

## What we needed: two locations

To find the nearest rider you need two things on a map:

1. **Where the food is** — the **vendor's** location. So vendors now have a **lat/lng**
   (latitude/longitude), set when the vendor is created.
2. **Where the riders are** — we already have this! Riders stream their live position over
   WebSockets (doc #14), and dispatch stores each rider's latest `lat/lng`.

## How dispatch learns the vendor's location 📞

Dispatch doesn't own vendor data — **catalog** does (one database per service, doc #9). So
dispatch **asks catalog over gRPC**: "where's vendor X?" This reuses the exact same
service-to-service pattern the order service uses to ask catalog for prices (doc #12) — a new
`GetVendor` call on the catalog gRPC API returns the vendor's coordinates.

```text
  order.ready ─► dispatch ──gRPC GetVendor(vendorId)──► catalog ──► { lat, lng }
                    │
                    ▼  measure distance to every ONLINE rider, pick the closest
                  rider.assigned
```

## Measuring distance 📏

The Earth is round, so we can't just subtract coordinates. We use the **haversine formula** —
the standard way to get the real "as the crow flies" distance between two lat/lng points in
kilometres. Dispatch computes it from the vendor to each online rider and picks the smallest.

## Sensible fallbacks 🪂

Geo is a *nice-to-have*, not a hard requirement — so it degrades gracefully:

- Vendor has **no location** set? → fall back to the old "least-recently-used rider."
- No online rider has reported a **position** yet? → same fallback.
- Catalog **unreachable**? → we log it and fall back, rather than failing the assignment.

So an order always gets a rider; geo just makes the choice *smarter* when the data is there.

## See it yourself

```bash
# a vendor WITH a pickup location (Abuja)
curl -X POST http://localhost:3000/catalog/vendors \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"name":"Abuja Kitchen","lat":9.0765,"lng":7.3986}'

# a rider right next to it, and one far away in Lagos
curl -X POST http://localhost:3000/dispatch/riders -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' -d '{"name":"Near","lat":9.08,"lng":7.40}'
curl -X POST http://localhost:3000/dispatch/riders -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' -d '{"name":"Far","lat":6.51,"lng":3.37}'

# place an order for that vendor and walk it to READY → the NEAR rider is assigned
```

We verified it end to end: with a vendor in Kano and a rider standing exactly at its door
(0 km) versus one in Lagos (~500 km away), dispatch logged
`nearest rider … @ 0.00 km from vendor` and assigned the close one — the far rider never got
it. 🎯

## What's next

The distance is a straight line today; a real system would use **road distance / ETA** from a
maps provider (behind a port, like our payment provider). And matching could weigh more than
distance — the rider's current load, direction, rating. All of that layers on top of the port
dispatch already depends on.
