import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"

import { getAuthEnv } from "@workspace/config/server"
import { authSchema, db, upsertUserSettings } from "@workspace/db"
import { createLogger } from "@workspace/observability"

const logger = createLogger("auth")
const env = getAuthEnv()

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account consent",
      accessType: "offline",
    },
  },
  plugins: [nextCookies()],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const normalizedEmail = user.email.toLowerCase()

          return {
            data: {
              ...user,
              email: normalizedEmail,
            },
          }
        },
        after: async (user) => {
          await upsertUserSettings(user.id)

          logger.info("Provisioned owner settings after auth user creation", {
            userId: user.id,
            email: user.email,
          })
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          logger.info("Created auth session", {
            sessionId: session.id,
            userId: session.userId,
          })
        },
      },
    },
  },
})
