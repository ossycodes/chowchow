import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import { ZodError, type ZodSchema } from "zod";

/**
 * NestJS pipe that validates (and strips unknown keys from) a value against a Zod schema.
 * Apply per-route: `@Body(new ZodValidationPipe(mySchema)) body: MyType`.
 *
 * On failure it throws a 400 with a readable, field-qualified message list — so bad input
 * never reaches your handler or the database.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          error: "Bad Request",
          message: err.issues.map(
            (i) => `${i.path.join(".") || "(body)"}: ${i.message}`,
          ),
        });
      }
      throw err;
    }
  }
}
