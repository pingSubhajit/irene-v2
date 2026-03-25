import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { config as loadDotenv } from "dotenv"
import { z } from "zod"

const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

const SSL_MODES_EQUIVALENT_TO_VERIFY_FULL = new Set(["prefer", "require", "verify-ca"])

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
  LOGO_DOT_DEV_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_LOGO_DOT_DEV_PUBLIC_KEY: z.string().min(1),
})

const fxEnvSchema = z.object({
  CURRENCYAPI_API_KEY: z.string().min(1).optional(),
  CURRENCYAPI_BASE_URL: z.url().default("https://api.currencyapi.com/v3"),
})

const cronEnvSchema = z.object({
  CRON_SECRET: z.string().min(1).optional(),
})

function booleanFlagSchema(defaultValue: boolean) {
  return z
    .union([
      z.boolean(),
      z
        .string()
        .trim()
        .toLowerCase()
        .transform((value) => {
          if (value === "true" || value === "1" || value === "yes" || value === "on") {
            return true
          }

          if (value === "false" || value === "0" || value === "no" || value === "off") {
            return false
          }

          throw new Error(`Invalid boolean flag value: ${value}`)
        }),
    ])
    .optional()
    .transform((value) => value ?? defaultValue)
}

const featureFlagsEnvSchema = z.object({
  ENABLE_ADVICE: booleanFlagSchema(true),
  ENABLE_MEMORY_LEARNING: booleanFlagSchema(true),
})

const serverEnvSchema = runtimeEnvSchema
  .extend(databaseEnvSchema.shape)
  .extend(authEnvSchema.shape)
  .extend(securityEnvSchema.shape)
  .extend(redisEnvSchema.shape)
  .extend(storageEnvSchema.shape)
  .extend(aiEnvSchema.shape)
  .extend(fxEnvSchema.shape)
  .extend(cronEnvSchema.shape)
  .extend(featureFlagsEnvSchema.shape)

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>
export type AuthEnv = z.infer<typeof authEnvSchema>
export type SecurityEnv = z.infer<typeof securityEnvSchema>
export type RedisEnv = z.infer<typeof redisEnvSchema>
export type StorageEnv = z.infer<typeof storageEnvSchema>
export type AiEnv = z.infer<typeof aiEnvSchema>
export type FxEnv = z.infer<typeof fxEnvSchema>
export type CronEnv = z.infer<typeof cronEnvSchema>
export type FeatureFlagsEnv = z.infer<typeof featureFlagsEnvSchema>
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
let fxEnvCache: FxEnv | null = null
let cronEnvCache: CronEnv | null = null
let featureFlagsEnvCache: FeatureFlagsEnv | null = null
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

export function normalizeDatabaseConnectionString(connectionString: string): string {
  const url = new URL(connectionString)
  const sslMode = url.searchParams.get("sslmode")

  if (!sslMode || !SSL_MODES_EQUIVALENT_TO_VERIFY_FULL.has(sslMode)) {
    return connectionString
  }

  if (url.searchParams.get("uselibpqcompat") === "true") {
    return connectionString
  }

  url.searchParams.set("sslmode", "verify-full")
  return url.toString()
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
    DATABASE_URL: normalizeDatabaseConnectionString(
      parsed.DATABASE_URL ?? parsed.DATABASE_URL_DIRECT!
    ),
    DATABASE_URL_DIRECT: normalizeDatabaseConnectionString(
      parsed.DATABASE_URL_DIRECT ?? parsed.DATABASE_URL!
    ),
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

export function getFxEnv(): FxEnv {
  ensureEnvLoaded()

  if (fxEnvCache) {
    return fxEnvCache
  }

  fxEnvCache = fxEnvSchema.parse(process.env)
  return fxEnvCache
}

export function getCronEnv(): CronEnv {
  ensureEnvLoaded()

  if (cronEnvCache) {
    return cronEnvCache
  }

  cronEnvCache = cronEnvSchema.parse(process.env)
  return cronEnvCache
}

export function getFeatureFlagsEnv(): FeatureFlagsEnv {
  ensureEnvLoaded()

  if (featureFlagsEnvCache) {
    return featureFlagsEnvCache
  }

  featureFlagsEnvCache = featureFlagsEnvSchema.parse(process.env)
  return featureFlagsEnvCache
}

export function getServerEnv(): ServerEnv {
  ensureEnvLoaded()

  if (serverEnvCache) {
    return serverEnvCache
  }

  serverEnvCache = serverEnvSchema.parse(process.env)
  return serverEnvCache
}

export function getEnvSanityChecks() {
  const runtime = getRuntimeEnv()
  const database = getDatabaseEnv()
  const auth = getAuthEnv()
  const security = getSecurityEnv()
  const redis = getRedisEnv()
  const storage = getStorageEnv()
  const ai = getAiEnv()
  const fx = getFxEnv()
  const features = getFeatureFlagsEnv()
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
    fx: Boolean(fx.CURRENCYAPI_API_KEY),
    adviceEnabled: features.ENABLE_ADVICE,
    memoryLearningEnabled: features.ENABLE_MEMORY_LEARNING,
  }
}
