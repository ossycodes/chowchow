# ELI5 #8 — "Show me and stop" (dump & die)

## The Laravel habit

In PHP/Laravel, when you're not sure what's inside a variable, you scribble `dd($thing)`
("dump and die"): it **prints** the thing and **stops** the page right there so nothing
else runs. Quick, messy, and honestly one of the most-used debugging tricks ever.

We wanted that same one-liner in our Node/NestJS world, so we added two little helpers to
the shared toolbox (`@chowdeck/nest`):

- **`dump(...)`** — print one or more values, then keep going.
- **`dd(...)`** — print them, then **stop** (throws, so nothing downstream runs).

## Why we needed our own

Node's built-in `console.log` has an annoying habit: for objects more than **two levels
deep** it gives up and prints `[Object]` instead of the contents — exactly when you most
want to see inside. Our helpers use Node's `util.inspect` with "show everything" turned on,
so you see the **whole** shape, nicely colored.

## How to use it

```ts
import { dd, dump } from "@chowdeck/nest";

// peek and continue
dump(input);
dump(input, user, event);   // as many as you like

// peek and STOP right here
dd(user);                   // prints user, then halts — nothing after runs
```

Inside a request handler, `dd()` aborts that request (the caller gets a 500), and the dump
shows up in the **service's terminal output**. That's the "and die" part.

## The one rule 🚧

`dd()`/`dump()` are **for local poking only** — never leave them in code you commit. They're
training wheels you take off before the bike goes in the shop. (A linter/CI check for stray
`dd(` is a good idea later.)

## When *not* to reach for it

`dd()` is the quick-and-dirty tool. For a bug you need to actually *step through*, the real
power tool is a **debugger** with breakpoints (VS Code: set a red dot, hit F5, send the
request, and execution pauses so you can inspect every variable live). Think of `dd()` as a
flashlight and the debugger as turning the room lights on — both belong in the toolbox.

## See it yourself

```ts
// drop this in, say, UsersService.register(), then send a register request:
dd(input);
// → your terminal prints the full input object, and the request stops at that line.
```
