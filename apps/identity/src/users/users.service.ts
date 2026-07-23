import { randomUUID } from "node:crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  ActorType,
  IdentityEventType,
  Topics,
  type UserRegistered,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { outboxEvents, users } from "../db/schema";
import type { RegisterRequest } from "./dto/register.request";

export type UserRecord = UserRegistered;

interface MysqlError {
  code?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  /**
   * Registers a customer. Input is already validated by ZodValidationPipe at the
   * controller boundary, so here we trust it. `actorType` is forced to `customer` —
   * public registration can never create a vendor/rider/admin.
   */
  async register(input: RegisterRequest): Promise<UserRecord> {
    const user: UserRecord = {
      userId: randomUUID(),
      actorType: ActorType.Customer,
      email: input.email,
      phone: input.phone,
    };

    const event = wrapEvent<UserRegistered>(
      IdentityEventType.UserRegistered,
      user,
      { producer: "identity", correlationId: user.userId },
    );

    // Insert the user AND the outbox event in ONE transaction — both commit or neither.
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
