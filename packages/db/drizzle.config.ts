import { defineConfig } from "drizzle-kit"
import { getDatabaseEnv } from "@workspace/config/server"

const { DATABASE_URL_DIRECT } = getDatabaseEnv()

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/drizzle",
  dbCredentials: {
    url: DATABASE_URL_DIRECT,
  },
  verbose: true,
  strict: true,
})
