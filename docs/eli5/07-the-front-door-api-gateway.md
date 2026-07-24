# ELI5 #7 — The Front Door (API Gateway)

## The problem: too many doors

Until now, each of our programs had its **own door** to the outside world:

- identity at `:3001`
- notifications at `:3002`
- and soon catalog, orders, dispatch, payments… each on its own port.

If the phone app had to knock on **every** door directly, two bad things happen:

1. The app has to memorize a dozen addresses. Move one → the app breaks. 😖
2. Every program has to check *"who are you, are you allowed in?"* by itself — the same
   lock installed a dozen times.

## The fix: one front door for the whole building

We built the **API gateway** — a single entrance at `:3000` that everyone goes through.
Behind it, the real programs sit on a private hallway. The gateway is the **receptionist +
security guard** for the whole building:

```
   phone app ──►  API GATEWAY (:3000)  ──►  identity   (private)
                  the only public door     ├─► notifications
                                           └─► catalog… (later)
```

Now the app knows **one** address. We can rename or move programs behind the gateway and
the app never notices.

## What the guard does on every knock

1. **Which room?** It looks at the address on the request (`/auth/...` → identity,
   `/users/...` → identity, `/notifications/...` → notifications) and walks it to the right
   room. If the address matches no room → **404** ("no such place here").

2. **Do you have a wristband?** Some doors are **public** — signing up (`/auth/register`)
   and logging in (`/auth/login`) don't need one, because that's *how* you get a wristband.
   Every other door is **protected**: you must show a valid **token** (a tamper-proof
   wristband). No wristband → **401** ("you're not allowed").

3. **Anti-fakery.** 🕵️ A sneaky visitor might scribble "I'm user #123" on their own hand.
   The guard **rubs off any such writing** before letting anyone in, then writes the *real*
   user id itself — but only after checking a genuine wristband. So you can't pretend to be
   someone else.

4. **Crowd control & safety.** The gateway also limits how fast one visitor can knock
   (**rate limiting** — stops abuse), and adds standard safety headers (**helmet**) and
   browser permissions (**CORS**).

## Wristbands = JWT tokens (and how you get one)

To make the guard meaningful, people need real wristbands. So we taught **identity** to
hand them out:

- **Sign up** (`/auth/register`) now needs a **password**, which we scramble into an
  unreadable **hash** before storing (we never keep the real password — see below).
- **Log in** (`/auth/login`): give your email + password. If they match, you get **two
  wristbands**:
  - an **access token** — your everyday wristband, valid ~15 minutes.
  - a **refresh token** — a "get a fresh wristband" ticket, valid ~2 weeks, so you don't
    have to re-type your password all day.
- **Refresh** (`/auth/refresh`): trade the refresh ticket for a new access wristband.

The wristband is a **JWT** — a little signed slip that says *"this is user #123, a
customer."* It's signed with a secret only our services know, so the gateway can check
it's genuine and unforged without calling the database.

## Passwords are never stored as-is 🔒

When you set a password, we run it through a one-way scrambler (**bcrypt**) and store only
the scramble. You can't un-scramble it back to the password. At login we scramble what you
typed and compare the scrambles. So even if someone stole our database, they wouldn't see
anyone's actual password.

## Validation vs. permission (a reminder)

Doc #6 was about **validation** ("is this input well-formed?"). This gateway adds
**authentication & authorization** ("who are you, and may you do this?"). Different guards,
both needed. The gateway is where the "who are you?" check lives, once, for everybody.

## See it yourself (everything through :3000)

```bash
# sign up
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret1"}'

# log in → copy the accessToken from the response
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret1"}'

# no wristband → 401
curl http://localhost:3000/users/me

# with wristband → your profile
curl http://localhost:3000/users/me -H "Authorization: Bearer <accessToken>"
```

We ran exactly this: no token → 401, faked `x-user-id` header → still 401 (rubbed off), real
token → your profile came back. The building has one guarded front door now. 🏢🛡️
