import { createJobRun } from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  SYSTEM_HEALTHCHECK_JOB_NAME,
  SYSTEM_QUEUE_NAME,
  enqueueSystemHealthcheck,
} from "@workspace/workflows"

type TriggerSystemHealthcheckInput = {
  source: "web" | "script"
  triggeredByUserId?: string
}

export async function triggerSystemHealthcheck(input: TriggerSystemHealthcheckInput) {
  const correlationId = createCorrelationId()
  const jobKey = `${SYSTEM_HEALTHCHECK_JOB_NAME}:${input.source}:${correlationId}`

  const jobRun = await createJobRun({
    queueName: SYSTEM_QUEUE_NAME,
    jobName: SYSTEM_HEALTHCHECK_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      source: input.source,
      triggeredByUserId: input.triggeredByUserId ?? null,
    },
  })

  const job = await enqueueSystemHealthcheck({
    correlationId,
    source: input.source,
    triggeredByUserId: input.triggeredByUserId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
  })

  return {
    job,
    jobRun,
  }
}
