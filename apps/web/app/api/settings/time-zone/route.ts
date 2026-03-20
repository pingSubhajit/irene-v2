import { NextResponse } from "next/server"

import { updateUserSettings } from "@workspace/db"

import { requireSession } from "@/lib/session"
import { isSupportedTimeZone } from "@/lib/time-zone-options"

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const timeZone = String(formData.get("timeZone") ?? "").trim()
  const redirectUrl = new URL("/settings", request.url)

  if (!isSupportedTimeZone(timeZone)) {
    redirectUrl.searchParams.set("tz", "invalid-time-zone")
    return NextResponse.redirect(redirectUrl, 303)
  }

  const settings = await updateUserSettings(session.user.id, {
    timeZone,
  })

  if (!settings) {
    redirectUrl.searchParams.set("tz", "save-failed")
    return NextResponse.redirect(redirectUrl, 303)
  }

  redirectUrl.searchParams.set("tz", "updated")
  return NextResponse.redirect(redirectUrl, 303)
}
