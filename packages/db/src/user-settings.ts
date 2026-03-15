import { db } from "./client"
import { userSettings } from "./schema"

export async function upsertUserSettings(userId: string) {
  await db
    .insert(userSettings)
    .values({
      userId,
    })
    .onConflictDoNothing()
}
