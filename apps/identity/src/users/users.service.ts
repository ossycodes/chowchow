import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import {
  ActorType,
  IdentityEventType,
  Topics,
  userRegisteredSchema,
  type UserRegistered,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { outboxEvents, users } from "../db/schema";

export interface RegisterInput {
  email?: string;
  phone?: string;
  actorType?: ActorType;
}

export type UserRecord = UserRegistered;

interface MysqlError {
  code?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  async register(input: RegisterInput): Promise<UserRecord> {
    // 1. Validate the input against the shared schema.
    let user: UserRecord;
    try {
      user = userRegisteredSchema.parse({
        userId: randomUUID(),
        actorType: input.actorType ?? ActorType.Customer,
        email: input.email,
        phone: input.phone,
      });
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException(err.issues.map((i) => i.message));
      }
      throw err;
    }

    const event = wrapEvent<UserRegistered>(
      IdentityEventType.UserRegistered,
      user,
      { producer: "identity", correlationId: user.userId },
    );

    // 2. Insert the user AND the outbox event in ONE transaction — either both commit
    //    or neither does. No user without its event; no event without its user.
    try {
      await this.dbService.db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: user.userId,
          actorType: user.actorType,
          email: user.email,
          phone: user.phone,
        });
        await tx.insert(outboxEvents).values({
          id: event.id,
          topic: Topics.Identity,
          envelope: event,
          key: user.userId,
        });
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") {
        throw new ConflictException("email already registered");
      }
      throw err;
    }

    return user;
  }

  async get(id: string): Promise<UserRecord | null> {
    const [row] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row) return null;
    return {
      userId: row.id,
      actorType: row.actorType as ActorType,
      email: row.email,
      phone: row.phone ?? undefined,
    };
  }
}
