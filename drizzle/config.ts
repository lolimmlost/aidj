import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  driver: "pg",
  db: process.env.DATABASE_URL,
  out: "./drizzle/generated"
});