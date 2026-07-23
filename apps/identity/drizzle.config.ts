import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// drizzle-kit runs from apps/identity; load the repo-root .env for the DB url.
loadEnv({ path: join(__dirname, "../../.env") });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url:
      process.env.IDENTITY_DATABASE_URL ??
      "mysql://root:root@localhost:3306/chowdeck_identity",
  },
});
