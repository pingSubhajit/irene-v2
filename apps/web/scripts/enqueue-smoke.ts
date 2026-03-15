import { closeDatabase } from "@workspace/db"
import { createLogger } from "@workspace/observability"
import { closeWorkflowConnections } from "@workspace/workflows"

import { triggerSystemHealthcheck } from "../lib/system-healthcheck"

const logger = createLogger("scripts.enqueue-smoke")

async function main() {
  try {
    const { jobRun } = await triggerSystemHealthcheck({
      source: "script",
    })

    logger.info("Enqueued script-driven system healthcheck", {
      jobRunId: jobRun.id,
    })
  } finally {
    await closeWorkflowConnections()
    await closeDatabase()
  }
}

main().catch((error) => {
  logger.errorWithCause("Failed to enqueue script-driven system healthcheck", error)
  process.exitCode = 1
})
