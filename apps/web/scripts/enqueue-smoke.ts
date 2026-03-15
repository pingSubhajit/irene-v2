import { createLogger } from "@workspace/observability"

import { triggerSystemHealthcheck } from "../lib/system-healthcheck"

const logger = createLogger("scripts.enqueue-smoke")

async function main() {
  const { jobRun } = await triggerSystemHealthcheck({
    source: "script",
  })

  logger.info("Enqueued script-driven system healthcheck", {
    jobRunId: jobRun.id,
  })
}

main().catch((error) => {
  logger.errorWithCause("Failed to enqueue script-driven system healthcheck", error)
  process.exitCode = 1
})
