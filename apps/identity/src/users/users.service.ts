import { randomUUID } from "node:crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcryptjs";
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

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  /**
   * Registers a customer. Input is already validated at the controller boundary.
   * `actorType` is forced to `customer` — public registration can never create a
   * vendor/rider/admin. The password is hashed (bcrypt) and never stored or emitted raw.
   */
  async register(input: RegisterRequest): Promise<UserRecord> {
    const user: UserRecord = {
      userId: randomUUID(),
      actorType: ActorType.Customer,
      email: input.email,
      phone: input.phone,
    };
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    // The event payload deliberately excludes the password/hash.
    const event = wrapEvent<UserRegistered>(
      IdentityEventType.UserRegistered,
      user,
      { producer: "identity", correlationId: user.userId },
    );

    try {
      await this.dbService.db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: user.userId,
          actorType: user.actorType,
          email: user.email,
          phone: user.phone,
          passwordHash,
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

  /** Returns the user if the email+password match, otherwise null. */
  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<UserRecord | null> {
    const [row] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!row) return null;
    const ok = await bcrypt.compare(password, row.passwordHash);
    if (!ok) return null;
    return this.toRecord(row);
  }

  async get(id: string): Promise<UserRecord | null> {
    const [row] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? this.toRecord(row) : null;
  }

  private toRecord(row: typeof users.$inferSelect): UserRecord {
    return {
      userId: row.id,
      actorType: row.actorType as ActorType,
      email: row.email,
      phone: row.phone ?? undefined,
    };
  }
}
