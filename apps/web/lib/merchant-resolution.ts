import { ensureJobRun } from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  enqueueMerchantRepairBackfill,
  MERCHANT_REPAIR_BACKFILL_JOB_NAME,
  MERCHANT_RESOLUTION_QUEUE_NAME,
} from "@workspace/workflows"

export async function triggerUserMerchantRepairBackfill(input: {
  userId: string
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${MERCHANT_REPAIR_BACKFILL_JOB_NAME}:${input.userId}:${new Date()
    .toISOString()
    .slice(0, 16)}`

  const jobRun = await ensureJobRun({
    queueName: MERCHANT_RESOLUTION_QUEUE_NAME,
    jobName: MERCHANT_REPAIR_BACKFILL_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      source: "web",
    },
  })

  await enqueueMerchantRepairBackfill({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    source: "web",
  })

  return jobRun
}
