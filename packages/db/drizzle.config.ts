import { defineConfig } from "drizzle-kit"

if (!process.env.DATABASE_URL_DIRECT) {
  throw new Error("DATABASE_URL_DIRECT is required for Drizzle migrations")
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT,
  },
  verbose: true,
  strict: true,
})
