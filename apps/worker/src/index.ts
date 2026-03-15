import { Worker } from "bullmq"

import { closeDatabase, updateJobRun } from "@workspace/db"
import { createLogger } from "@workspace/observability"
import {
  QUEUE_PREFIX,
  SYSTEM_HEALTHCHECK_JOB_NAME,
  SYSTEM_QUEUE_NAME,
  createWorkerRedisConnection,
  systemHealthcheckJobPayloadSchema,
} from "@workspace/workflows"

const logger = createLogger("worker")

const workerConnection = createWorkerRedisConnection()

const worker = new Worker(
  SYSTEM_QUEUE_NAME,
  async (job) => {
    if (job.name !== SYSTEM_HEALTHCHECK_JOB_NAME) {
      throw new Error(`Unsupported job: ${job.name}`)
    }

    const payload = systemHealthcheckJobPayloadSchema.parse(job.data)

    await updateJobRun(payload.jobRunId, {
      status: "running",
      attemptCount: job.attemptsMade + 1,
      startedAt: new Date(),
      errorMessage: null,
    })

    logger.info("Processing system healthcheck job", {
      jobId: job.id,
      correlationId: payload.correlationId,
      source: payload.source,
      jobRunId: payload.jobRunId,
    })

    await updateJobRun(payload.jobRunId, {
      status: "succeeded",
      attemptCount: job.attemptsMade + 1,
      completedAt: new Date(),
      errorMessage: null,
    })

    logger.info("Completed system healthcheck job", {
      jobId: job.id,
      correlationId: payload.correlationId,
      jobRunId: payload.jobRunId,
    })

    return {
      ok: true,
      processedAt: new Date().toISOString(),
    }
  },
  {
    connection: workerConnection,
    prefix: QUEUE_PREFIX,
    concurrency: 5,
  },
)

worker.on("ready", () => {
  logger.info("System worker ready", {
    queueName: SYSTEM_QUEUE_NAME,
  })
})

worker.on("failed", async (job, error) => {
  logger.errorWithCause("System worker job failed", error, {
    jobId: job?.id,
    jobName: job?.name,
  })

  const jobRunId = job?.data?.jobRunId

  if (typeof jobRunId === "string") {
    await updateJobRun(jobRunId, {
      status: "failed",
      attemptCount: job?.attemptsMade ?? 0,
      completedAt: new Date(),
      errorMessage: error.message,
    })
  }
})

async function shutdown(signal: string) {
  logger.info("Shutting down worker", { signal })

  await worker.close()
  await closeDatabase()
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        logger.errorWithCause("Worker shutdown failed", error, { signal })
        process.exit(1)
      })
  })
}
