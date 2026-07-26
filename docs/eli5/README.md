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

_(More added as we build. See the roadmap in [../ARCHITECTURE.md](../ARCHITECTURE.md).)_
