import { z } from "zod"

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.url(),
  DATABASE_URL_DIRECT: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ALLOWED_EMAILS: z.string().min(1),
  UPSTASH_REDIS_HOST: z.string().min(1),
  UPSTASH_REDIS_PORT: z.coerce.number().int().positive(),
  UPSTASH_REDIS_PASSWORD: z.string().min(1),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let envCache: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (envCache) {
    return envCache
  }

  envCache = serverEnvSchema.parse(process.env)
  return envCache
}

export function getAllowedEmails() {
  const env = getServerEnv()

  return new Set(
    env.ALLOWED_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAllowedEmail(email: string) {
  return getAllowedEmails().has(email.trim().toLowerCase())
}

export function getEnvSanityChecks() {
  const env = getServerEnv()

  return {
    auth: Boolean(
      env.BETTER_AUTH_SECRET &&
        env.BETTER_AUTH_URL &&
        env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET,
    ),
    database: Boolean(env.DATABASE_URL && env.DATABASE_URL_DIRECT),
    redis: Boolean(
      env.UPSTASH_REDIS_HOST &&
        env.UPSTASH_REDIS_PORT &&
        env.UPSTASH_REDIS_PASSWORD,
    ),
    allowlistSize: getAllowedEmails().size,
  }
}
