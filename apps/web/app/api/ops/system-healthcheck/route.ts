import { NextResponse } from "next/server"

import { createLogger } from "@workspace/observability"

import { requireSession } from "@/lib/session"
import { triggerSystemHealthcheck } from "@/lib/system-healthcheck"

export const runtime = "nodejs"

const logger = createLogger("ops.system-healthcheck")

export async function POST() {
  const session = await requireSession()
  const { jobRun } = await triggerSystemHealthcheck({
    source: "web",
    triggeredByUserId: session.user.id,
  })

  logger.info("Enqueued system healthcheck from web", {
    jobRunId: jobRun.id,
    userId: session.user.id,
  })

  return NextResponse.json({
    jobRunId: jobRun.id,
  })
}
