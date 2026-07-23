import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe";
import { validateEnv } from "./validate-env";

const schema = z.object({
  email: z.string().email().max(255),
  phone: z.string().max(32).optional(),
});

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(schema);

  it("returns parsed value for valid input", () => {
    expect(pipe.transform({ email: "ada@example.com" })).toEqual({
      email: "ada@example.com",
    });
  });

  it("strips unknown keys (whitelisting)", () => {
    expect(
      pipe.transform({ email: "ada@example.com", role: "admin" }),
    ).toEqual({ email: "ada@example.com" });
  });

  it("throws 400 with field-qualified messages on bad input", () => {
    try {
      pipe.transform({ email: "nope" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const res = (err as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(res.message[0]).toContain("email");
    }
  });
});

describe("validateEnv", () => {
  const envSchema = z.object({
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url(),
  });

  it("parses and coerces valid env", () => {
    const env = validateEnv(envSchema, {
      DATABASE_URL: "mysql://root:root@localhost:3306/db",
    } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toContain("mysql://");
  });

  it("throws a readable error when required env is missing", () => {
    expect(() => validateEnv(envSchema, {} as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment configuration/,
    );
  });
});
