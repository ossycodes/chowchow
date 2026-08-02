# ELI5 Docs — Explain It Like I'm 5

Plain-language explanations of every feature we build, using everyday analogies and as
little jargon as possible. If the code is the "how", these are the "what and why".

> Rule for this project: **every change/feature gets an ELI5 doc here**, written as part
> of the same change.

## Index

1. [The Big Picture — what Chowdeck even is](01-the-big-picture.md)
2. [The Monorepo & Microservices — how the code is organized](02-monorepo-and-microservices.md)
3. [Events & the Outbox — how services talk without losing messages](03-events-and-the-outbox.md)
4. [The Notifications Service — listening for events (and not acting twice)](04-notifications-listening-for-events.md)
5. [A Real Database — MySQL, transactions, migrations](05-a-real-database.md)
6. [Guarding the Doors — input validation & fail-fast config](06-guarding-the-doors-validation.md)
7. [The Front Door — API gateway, JWT auth & passwords](07-the-front-door-api-gateway.md)
8. [Show me and stop — dump & die debugging](08-dump-and-die-debugging.md)
9. [The Menu Board — catalog: vendors & menu items](09-the-catalog-menus-and-vendors.md)
10. [Services Phoning Each Other — gRPC internal calls](10-services-talking-directly-grpc.md)
11. [The Checkout — orders, pricing & the lifecycle](11-checkout-and-the-order-lifecycle.md)
12. [How Order Calls Catalog — gRPC client, up close](12-how-order-calls-catalog-over-grpc.md)
13. [Finding a Rider — event-driven dispatch](13-dispatch-assigning-riders-with-events.md)
14. [Watching the Bike Move — live tracking with WebSockets](14-live-tracking-with-websockets.md)
15. [Taking the Money — payments](15-taking-payment-on-an-order.md)
16. [Keeping the Books — double-entry ledger](16-the-books-double-entry-ledger.md)
17. [Paying the Vendors — settlements](17-paying-vendors-settlements.md)
18. [Taking a Cut — commission splits](18-taking-a-cut-commission-splits.md)
19. [Remembering Across Restarts — Redis idempotency](19-remembering-across-restarts-redis.md)
20. [Finding the Closest Rider — geo matching](20-finding-the-closest-rider-geo.md)
21. [The Rider's Cut — delivery fee](21-the-riders-cut-delivery-fee.md)
22. [Paying the Riders — rider settlements](22-paying-the-riders-settlements.md)
23. [Paying on a Timer — payout scheduler](23-paying-on-a-timer-scheduler.md)
24. [A Fairer Fee — delivery by distance](24-fair-delivery-fee-by-distance.md)
25. [A Real Payment Provider — webhooks](25-a-real-payment-provider-webhooks.md)
26. [Consumers That Recover Quickly — Kafka resilience](26-consumers-that-recover-quickly.md)

_(More added as we build. See the roadmap in [../ARCHITECTURE.md](../ARCHITECTURE.md).)_
