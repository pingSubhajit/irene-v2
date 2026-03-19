import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { getCronEnv } from "@workspace/config/server"

import { FX_WARM_LOOKBACK_DAYS, triggerFxRateWarmup } from "@/lib/fx-valuation"

export const runtime = "nodejs"

export async function GET() {
  const env = getCronEnv()

  if (!env.CRON_SECRET) {
    return NextResponse.json(
      {
        error: "CRON_SECRET is not configured.",
      },
      {
        status: 503,
      },
    )
  }

  const authorization = (await headers()).get("authorization")

  if (authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    )
  }

  const { jobRun } = await triggerFxRateWarmup(FX_WARM_LOOKBACK_DAYS)

  return NextResponse.json({
    ok: true,
    jobRunId: jobRun.id,
    lookbackDays: FX_WARM_LOOKBACK_DAYS,
  })
}
