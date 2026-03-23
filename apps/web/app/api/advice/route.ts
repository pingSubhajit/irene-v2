import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdviceItemById, updateAdviceItem } from "@workspace/db"

import { triggerUserAdviceRefresh } from "@/lib/advice"
import { requireSession } from "@/lib/session"

const mutateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("dismiss"),
    adviceItemId: z.string().uuid(),
    redirectTo: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("done"),
    adviceItemId: z.string().uuid(),
    redirectTo: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("restore"),
    adviceItemId: z.string().uuid(),
    redirectTo: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("refresh"),
    redirectTo: z.string().min(1).optional(),
  }),
])

function redirectTo(path: string, status: string) {
  const url = new URL(path, "http://localhost")
  url.searchParams.set("advice", status)
  return NextResponse.redirect(url)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const parsed = mutateSchema.parse({
    action: formData.get("action"),
    adviceItemId: formData.get("adviceItemId"),
    redirectTo: formData.get("redirectTo"),
  })

  const redirectPath = parsed.redirectTo ?? "/advice"

  if (parsed.action === "refresh") {
    await triggerUserAdviceRefresh({
      userId: session.user.id,
      reason: "manual_refresh",
    })

    return redirectTo(redirectPath, "refresh-queued")
  }

  const advice = await getAdviceItemById(parsed.adviceItemId)

  if (!advice || advice.adviceItem.userId !== session.user.id) {
    return redirectTo(redirectPath, "missing")
  }

  if (parsed.action === "dismiss") {
    await updateAdviceItem(parsed.adviceItemId, {
      status: "dismissed",
      dismissedAt: new Date(),
      homeRankScore: null,
      homeRankPosition: null,
      rankedAt: null,
    })
    return redirectTo(redirectPath, "dismissed")
  }

  if (parsed.action === "done") {
    await updateAdviceItem(parsed.adviceItemId, {
      status: "done",
      doneAt: new Date(),
      homeRankScore: null,
      homeRankPosition: null,
      rankedAt: null,
    })
    return redirectTo(redirectPath, "done")
  }

  await updateAdviceItem(parsed.adviceItemId, {
    status: "active",
    dismissedAt: null,
    doneAt: null,
    homeRankScore: null,
    homeRankPosition: null,
    rankedAt: null,
  })
  return redirectTo(redirectPath, "restored")
}
