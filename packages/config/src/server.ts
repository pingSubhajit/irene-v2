import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { z } from "zod"

const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

const databaseEnvInputSchema = z
  .object({
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_DIRECT: z.url().optional(),
  })
  .superRefine((value, context) => {
    if (value.DATABASE_URL || value.DATABASE_URL_DIRECT) {
      return
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL or DATABASE_URL_DIRECT must be set",
    })
  })

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_URL_DIRECT: z.url(),
})

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ALLOWED_EMAILS: z.string().min(1),
})

const securityEnvSchema = z.object({
  APP_ENCRYPTION_KEY: z.string().min(32),
})

const redisEnvSchema = z.object({
  UPSTASH_REDIS_HOST: z.string().min(1),
  UPSTASH_REDIS_PORT: z.coerce.number().int().positive(),
  UPSTASH_REDIS_PASSWORD: z.string().min(1),
})

const storageEnvSchema = z.object({
  GCS_BUCKET: z.string().min(1),
  GCS_PROJECT_ID: z.string().min(1),
  GCS_CLIENT_EMAIL: z.string().min(1),
  GCS_PRIVATE_KEY: z.string().min(1).transform((value) => value.replace(/\\n/g, "\n")),
})

const aiEnvSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1),
})

const cronEnvSchema = z.object({
  CRON_SECRET: z.string().min(1).optional(),
})

const serverEnvSchema = runtimeEnvSchema
  .extend(databaseEnvSchema.shape)
  .extend(authEnvSchema.shape)
  .extend(securityEnvSchema.shape)
  .extend(redisEnvSchema.shape)
  .extend(storageEnvSchema.shape)
  .extend(aiEnvSchema.shape)
  .extend(cronEnvSchema.shape)

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>
export type AuthEnv = z.infer<typeof authEnvSchema>
export type SecurityEnv = z.infer<typeof securityEnvSchema>
export type RedisEnv = z.infer<typeof redisEnvSchema>
export type StorageEnv = z.infer<typeof storageEnvSchema>
export type AiEnv = z.infer<typeof aiEnvSchema>
export type CronEnv = z.infer<typeof cronEnvSchema>
export type ServerEnv = z.infer<typeof serverEnvSchema>

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

let envLoaded = false
let runtimeEnvCache: RuntimeEnv | null = null
let databaseEnvCache: DatabaseEnv | null = null
let authEnvCache: AuthEnv | null = null
let securityEnvCache: SecurityEnv | null = null
let redisEnvCache: RedisEnv | null = null
let storageEnvCache: StorageEnv | null = null
let aiEnvCache: AiEnv | null = null
let cronEnvCache: CronEnv | null = null
let serverEnvCache: ServerEnv | null = null

function ensureEnvLoaded() {
  if (envLoaded) {
    return
  }

  loadDotenv({
    path: resolve(workspaceRoot, ".env"),
    quiet: true,
  })
  loadDotenv({
    path: resolve(workspaceRoot, ".env.local"),
    override: true,
    quiet: true,
  })

  envLoaded = true
}

export function getRuntimeEnv(): RuntimeEnv {
  ensureEnvLoaded()

  if (runtimeEnvCache) {
    return runtimeEnvCache
  }

  runtimeEnvCache = runtimeEnvSchema.parse(process.env)
  return runtimeEnvCache
}

export function getDatabaseEnv(): DatabaseEnv {
  ensureEnvLoaded()

  if (databaseEnvCache) {
    return databaseEnvCache
  }

  const parsed = databaseEnvInputSchema.parse(process.env)

  databaseEnvCache = databaseEnvSchema.parse({
    DATABASE_URL: parsed.DATABASE_URL ?? parsed.DATABASE_URL_DIRECT,
    DATABASE_URL_DIRECT: parsed.DATABASE_URL_DIRECT ?? parsed.DATABASE_URL,
  })

  return databaseEnvCache
}

export function getAuthEnv(): AuthEnv {
  ensureEnvLoaded()

  if (authEnvCache) {
    return authEnvCache
  }

  authEnvCache = authEnvSchema.parse(process.env)
  return authEnvCache
}

export function getSecurityEnv(): SecurityEnv {
  ensureEnvLoaded()

  if (securityEnvCache) {
    return securityEnvCache
  }

  securityEnvCache = securityEnvSchema.parse(process.env)
  return securityEnvCache
}

export function getRedisEnv(): RedisEnv {
  ensureEnvLoaded()

  if (redisEnvCache) {
    return redisEnvCache
  }

  redisEnvCache = redisEnvSchema.parse(process.env)
  return redisEnvCache
}

export function getStorageEnv(): StorageEnv {
  ensureEnvLoaded()

  if (storageEnvCache) {
    return storageEnvCache
  }

  storageEnvCache = storageEnvSchema.parse(process.env)
  return storageEnvCache
}

export function getAiEnv(): AiEnv {
  ensureEnvLoaded()

  if (aiEnvCache) {
    return aiEnvCache
  }

  aiEnvCache = aiEnvSchema.parse(process.env)
  return aiEnvCache
}

export function getCronEnv(): CronEnv {
  ensureEnvLoaded()

  if (cronEnvCache) {
    return cronEnvCache
  }

  cronEnvCache = cronEnvSchema.parse(process.env)
  return cronEnvCache
}

export function getServerEnv(): ServerEnv {
  ensureEnvLoaded()

  if (serverEnvCache) {
    return serverEnvCache
  }

  serverEnvCache = serverEnvSchema.parse(process.env)
  return serverEnvCache
}

export function getAllowedEmails() {
  const env = getAuthEnv()

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
  const runtime = getRuntimeEnv()
  const database = getDatabaseEnv()
  const auth = getAuthEnv()
  const security = getSecurityEnv()
  const redis = getRedisEnv()
  const storage = getStorageEnv()
  const ai = getAiEnv()
  return {
    nodeEnv: runtime.NODE_ENV,
    auth: Boolean(
      auth.BETTER_AUTH_SECRET &&
        auth.BETTER_AUTH_URL &&
        auth.GOOGLE_CLIENT_ID &&
        auth.GOOGLE_CLIENT_SECRET,
    ),
    database: Boolean(database.DATABASE_URL && database.DATABASE_URL_DIRECT),
    redis: Boolean(
      redis.UPSTASH_REDIS_HOST &&
        redis.UPSTASH_REDIS_PORT &&
        redis.UPSTASH_REDIS_PASSWORD,
    ),
    security: Boolean(security.APP_ENCRYPTION_KEY),
    storage: Boolean(
      storage.GCS_BUCKET &&
        storage.GCS_PROJECT_ID &&
        storage.GCS_CLIENT_EMAIL &&
        storage.GCS_PRIVATE_KEY,
    ),
    ai: Boolean(ai.AI_GATEWAY_API_KEY),
    allowlistSize: getAllowedEmails().size,
  }
}
