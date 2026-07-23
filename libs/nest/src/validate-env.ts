import { z, ZodError, type ZodTypeAny } from "zod";

/**
 * Validate process.env against a Zod schema at startup, so misconfiguration fails fast
 * with a readable message instead of blowing up deep inside the app at runtime.
 * Returns the parsed, typed, defaulted config (the schema's output type).
 */
export function validateEnv<S extends ZodTypeAny>(
  schema: S,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<S> {
  try {
    return schema.parse(env);
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${details}`);
    }
    throw err;
  }
}
