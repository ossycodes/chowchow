import { inspect } from "node:util";

/**
 * Format a value for full-depth, colorized console output — Laravel's `dump()` for Node.
 *
 * Node truncates nested objects at depth 2 by default; this expands everything so you
 * can actually see the whole shape. Use it when a plain `console.log` hides what you need.
 */
function format(value: unknown): string {
  return inspect(value, { depth: null, colors: true, maxArrayLength: null });
}

/**
 * `dump()` — print one or more values at full depth and keep going. The non-fatal cousin
 * of `dd()`. Returns nothing; purely a side effect.
 *
 * @example
 *   dump(input, user);
 */
export function dump(...values: unknown[]): void {
  for (const value of values) {
    // eslint-disable-next-line no-console
    console.log(format(value));
  }
}

/**
 * `dd()` — "dump and die", the Laravel habit ported to Node/Nest. Prints the given values
 * at full depth, then throws to halt execution right here so nothing downstream runs.
 *
 * Inside a NestJS request this aborts the request (you'll see the dump in the service's
 * stdout); the thrown error surfaces as a 500. Meant for local debugging only — never
 * leave a `dd()` in committed code.
 *
 * The `never` return type lets TypeScript know execution stops, so it's happy after a
 * `dd()` even where a value would otherwise be required.
 *
 * @example
 *   dd(input, user); // execution never continues past this line
 */
export function dd(...values: unknown[]): never {
  dump(...values);
  throw new Error("dd(): execution halted (dump-and-die)");
}
