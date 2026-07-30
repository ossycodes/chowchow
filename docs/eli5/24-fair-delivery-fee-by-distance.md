# ELI5 #24 — A Fairer Fee (Delivery by Distance)

## Flat isn't fair

Doc #21 charged a **flat** delivery fee — the same ₦500 whether the rider goes around the
corner or across the city. That's simple but unfair: a long trip costs the rider more time and
fuel. So now the fee depends on **how far** the food travels: from the **restaurant** to **your
door**. 📏🛵

## The formula

```text
  fee = base + (per-km rate × distance from vendor to customer)
```

- **base** (`DELIVERY_FEE_BASE_KOBO`, default ₦300) — the minimum, even for a next-door order.
- **per-km** (`DELIVERY_FEE_PER_KM_KOBO`, default ₦50/km) — added for every kilometre.

We measure the **straight-line distance** with the same haversine formula dispatch uses to
find the nearest rider (doc #20). All in whole **kobo**.

## Where the two points come from 📍

- **Vendor (pickup):** the restaurant's coordinates — the order service asks **catalog** over
  gRPC (`GetVendor`), the very same call dispatch uses. (Order was already a catalog gRPC
  client for prices; now it uses it for the vendor's location too.)
- **Customer (drop-off):** you send your delivery `lat`/`lng` in the checkout request. It's
  saved on the order (handy later for routing the rider to your door).

## Always charges *something* 🪂

If we can't work out the distance — the vendor has no coordinates, or you didn't send a
delivery location — we fall back to the old **flat fee** (`DELIVERY_FEE_KOBO`). So every order
still gets a sensible fee; distance just makes it *fairer* when we have the data.

## It still splits the same way

Nothing downstream changes: the fee is still the **rider's** share. Payments and the ledger
split each order into vendor + platform + rider exactly as before (docs #18, #21) — only the
*size* of the rider's slice now depends on distance.

## See it yourself

```bash
# vendor with a location (Yaba)
curl -X POST http://localhost:3000/catalog/vendors -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' -d '{"name":"Yaba Kitchen","lat":6.5095,"lng":3.3711}'

# a NEAR delivery vs a FAR one — same order, different fee
curl -X POST http://localhost:3000/orders -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"vendorId":"<id>","items":[{"itemId":"<id>","quantity":1}],"deliveryLat":6.515,"deliveryLng":3.376}'
#   → small fee (~₦340 for ~1 km)
curl ... -d '{..., "deliveryLat":6.4698, "deliveryLng":3.5852}'   # Lekki, ~24 km
#   → bigger fee (~₦1,500)
```

We verified exactly this: a ~1 km delivery cost **₦340**, a ~24 km one cost **₦1,503**, and an
order with no location fell back to the flat **₦500**. 🎯

## What's next

The distance is a straight line ("as the crow flies"). A production app would use **road
distance / ETA** from a maps provider (behind a port, like the payment provider) — real streets,
one-way roads, traffic. The formula stays the same; only the *distance* becomes smarter.
