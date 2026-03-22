import { createJobRun } from "@workspace/db"
import { createCorrelationId } from "@workspace/observability"
import {
  enqueueReconciliationModelRetry,
  RECONCILIATION_QUEUE_NAME,
  RECONCILIATION_MODEL_RETRY_JOB_NAME,
} from "@workspace/workflows"

export async function retryReconciliationModelRun(input: {
  userId: string
  extractedSignalId: string
  rawDocumentId: string
  modelRunId: string
}) {
  const correlationId = createCorrelationId()
  const jobKey = `${RECONCILIATION_MODEL_RETRY_JOB_NAME}:${input.modelRunId}:${Date.now()}`
  const jobRun = await createJobRun({
    queueName: RECONCILIATION_QUEUE_NAME,
    jobName: RECONCILIATION_MODEL_RETRY_JOB_NAME,
    jobKey,
    payloadJson: {
      correlationId,
      userId: input.userId,
      modelRunId: input.modelRunId,
      extractedSignalId: input.extractedSignalId,
      rawDocumentId: input.rawDocumentId,
      source: "web",
    },
  })

  await enqueueReconciliationModelRetry({
    correlationId,
    jobRunId: jobRun.id,
    jobKey,
    requestedAt: new Date().toISOString(),
    userId: input.userId,
    modelRunId: input.modelRunId,
    extractedSignalId: input.extractedSignalId,
    rawDocumentId: input.rawDocumentId,
    source: "web",
  })

  return jobRun
}
