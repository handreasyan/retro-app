import type { Config } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

loadEnv();

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://retro:retro@localhost:5432/retro",
  },
} satisfies Config;
