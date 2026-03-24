import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { upsertUserSettings } from "@workspace/db"

import { auth } from "./auth"

export async function getServerSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return null
  }

  await upsertUserSettings(session.user.id)

  return session
}

export async function requireSession() {
  const session = await getServerSession()

  if (!session) {
    redirect("/sign-in")
  }

  return session
}
