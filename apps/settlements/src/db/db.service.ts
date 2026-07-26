import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";

/**
 * Owns the MySQL connection pool and the Drizzle query interface. Inject this service
 * and use `dbService.db` to run queries/transactions.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool!: mysql.Pool;
  public db!: MySql2Database<typeof schema>;

  async onModuleInit(): Promise<void> {
    const url = process.env.SETTLEMENT_DATABASE_URL;
    if (!url) {
      throw new Error("SETTLEMENT_DATABASE_URL is not set (see .env)");
    }
    this.pool = mysql.createPool(url);
    this.db = drizzle(this.pool, { schema, mode: "default" });
    // Fail fast if the DB is unreachable.
    await this.pool.query("SELECT 1");
    this.logger.log("connected to MySQL (chowdeck_settlement)");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
