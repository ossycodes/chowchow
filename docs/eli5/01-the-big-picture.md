# ELI5 #1 — The Big Picture

## What are we building?

Imagine a **super-fast helper** that does three things at once:

1. You're hungry. You open an app, pick jollof rice from a restaurant, and pay. 🍚
2. The restaurant gets a ding: "Make this order!" and starts cooking. 👨‍🍳
3. A rider on a bike zooms to the restaurant, grabs the food, and brings it to your door. 🏍️

That's Chowdeck. We're building our own version of it.

## The three kinds of people

Every food-delivery app is really a meeting point for **three groups**:

| Who | What they want |
|-----|----------------|
| 🧑 **Customer** | "I'm hungry, bring me food, and let me watch it come." |
| 🏪 **Vendor** (restaurant/shop) | "Tell me what to cook, and pay me for it." |
| 🏍️ **Rider** | "Tell me where to pick up and drop off, and pay me for the trip." |

Our app is the **matchmaker in the middle** connecting all three, plus the **office
staff** (admin) who watch everything and fix problems.

## The secret: it's not really a "food app"

Here's the surprising part. The hard, valuable magic is **not** the pretty menu. It's two
invisible things:

1. **Dispatch** — picking the *right rider* for each order, super fast. (Like a teacher
   choosing which kid is closest to run an errand — but for thousands of orders at once.)
2. **Money** — making sure every naira is counted correctly: the customer pays, the
   restaurant gets its share, the rider gets paid, and the app keeps a small fee. Get
   this wrong and people get angry very fast.

So we're really building a **delivery-and-money machine** that happens to show food.

## How big companies build it

Companies like DoorDash and Uber Eats don't build one giant program. They build **lots of
small programs** that each do one job and talk to each other — like a kitchen where one
person only chops, one only fries, one only plates. That's called **microservices**, and
that's the style we chose. The next doc explains how.
