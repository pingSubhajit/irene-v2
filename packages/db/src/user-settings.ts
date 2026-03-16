import { db } from "./client"
import { userSettings } from "./schema"
import { eq } from "drizzle-orm"

export async function upsertUserSettings(userId: string) {
  await db
    .insert(userSettings)
    .values({
      userId,
    })
    .onConflictDoNothing()
}

export async function getUserSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  if (settings) {
    return settings
  }

  await upsertUserSettings(userId)

  const [created] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)

  if (!created) {
    throw new Error("Failed to load user settings")
  }

  return created
}
