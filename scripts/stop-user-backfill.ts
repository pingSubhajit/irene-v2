import { and, eq, inArray, sql } from "drizzle-orm"

import {
  db,
  getGmailOauthConnectionForUser,
  getLatestCursorForConnection,
  jobRuns,
  updateEmailSyncCursor,
} from "@workspace/db"
import {
  BACKFILL_IMPORT_QUEUE_NAME,
  GMAIL_BACKFILL_PAGE_JOB_NAME,
  GMAIL_BACKFILL_START_JOB_NAME,
  getBackfillImportQueue,
} from "@workspace/workflows"

const CONFIRM_TOKEN = "STOP_BACKFILL"
const TARGET_JOB_NAMES = [GMAIL_BACKFILL_START_JOB_NAME, GMAIL_BACKFILL_PAGE_JOB_NAME] as const
const REMOVABLE_STATES = ["waiting", "delayed", "prioritized", "paused"] as const
const ACTIVE_STATE = ["active"] as const

type BackfillJobLike = {
  id?: string | number | undefined
  name: string
  data?: {
    userId?: unknown
    oauthConnectionId?: unknown
    jobRunId?: unknown
  }
  remove: () => Promise<void>
}

function parseArgs(argv: string[]) {
  let userId: string | null = null
  let confirm: string | null = null

  for (const arg of argv) {
    if (arg.startsWith("--confirm=")) {
      confirm = arg.slice("--confirm=".length)
      continue
    }

    if (arg === "--help" || arg === "-h") {
      return { help: true as const, userId: null, confirm: null }
    }

    if (!userId) {
      userId = arg
    }
  }

  return { help: false as const, userId, confirm }
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  pnpm exec tsx scripts/stop-user-backfill.ts <userId> --confirm=STOP_BACKFILL",
      "",
      "This script:",
      "  1. marks the Gmail backfill cursor as completed",
      "  2. removes pending backfill jobs for the given user",
      "  3. lets already-active backfill work drain",
      "  4. prevents follow-up backfill pages from pulling more emails",
      "  5. marks cancelled queued job_run rows as failed",
    ].join("\n"),
  )
}

function isTargetBackfillJob(
  job: BackfillJobLike,
  input: { userId: string; oauthConnectionId: string | null },
) {
  if (!TARGET_JOB_NAMES.includes(job.name as (typeof TARGET_JOB_NAMES)[number])) {
    return false
  }

  const jobUserId = typeof job.data?.userId === "string" ? job.data.userId : null
  if (jobUserId !== input.userId) {
    return false
  }

  if (!input.oauthConnectionId) {
    return true
  }

  const jobOauthConnectionId =
    typeof job.data?.oauthConnectionId === "string" ? job.data.oauthConnectionId : null

  return jobOauthConnectionId === input.oauthConnectionId
}

async function listJobsForState(
  state: (typeof REMOVABLE_STATES)[number] | (typeof ACTIVE_STATE)[number],
) {
  const queue = getBackfillImportQueue()
  return queue.getJobs([state], 0, -1, true)
}

async function listTargetJobs(input: { userId: string; oauthConnectionId: string | null }) {
  const [activeJobs, ...removableJobGroups] = await Promise.all([
    listJobsForState("active"),
    ...REMOVABLE_STATES.map((state) => listJobsForState(state)),
  ])

  return {
    activeJobs: activeJobs.filter((job) => isTargetBackfillJob(job, input)),
    removableJobs: removableJobGroups
      .flat()
      .filter((job) => isTargetBackfillJob(job, input)),
  }
}

async function removeJobs(jobsToRemove: BackfillJobLike[]) {
  const removedJobRunIds = new Set<string>()
  const removedJobIds = new Set<string>()

  for (const job of jobsToRemove) {
    await job.remove()

    if (job.id !== undefined && job.id !== null) {
      removedJobIds.add(String(job.id))
    }

    if (typeof job.data?.jobRunId === "string") {
      removedJobRunIds.add(job.data.jobRunId)
    }
  }

  return {
    removedJobIds,
    removedJobRunIds,
  }
}

async function markCancelledBackfillJobRunsFailed(jobRunIds: string[]) {
  if (jobRunIds.length === 0) {
    return []
  }

  const now = new Date()

  const rows = await db
    .update(jobRuns)
    .set({
      status: "failed",
      retryable: false,
      completedAt: now,
      errorMessage: "Cancelled by stop-user-backfill script",
      lastErrorCode: "cancelled_by_script",
      lastErrorAt: now,
    })
    .where(
      and(
        inArray(jobRuns.id, jobRunIds),
        inArray(jobRuns.status, ["queued", "running"]),
      ),
    )
    .returning({ id: jobRuns.id, status: jobRuns.status })

  return rows
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))

  if (parsed.help) {
    printUsage()
    return
  }

  if (!parsed.userId || parsed.confirm !== CONFIRM_TOKEN) {
    printUsage()
    process.exitCode = 1
    return
  }

  const connection = await getGmailOauthConnectionForUser(parsed.userId)
  const cursor = connection ? await getLatestCursorForConnection(connection.id) : null
  const queue = getBackfillImportQueue()

  console.log(
    JSON.stringify(
      {
        step: "start",
        userId: parsed.userId,
        oauthConnectionId: connection?.id ?? null,
        cursorId: cursor?.id ?? null,
        queueName: BACKFILL_IMPORT_QUEUE_NAME,
      },
      null,
      2,
    ),
  )

  const snapshot = await listTargetJobs({
    userId: parsed.userId,
    oauthConnectionId: connection?.id ?? null,
  })

  try {
    if (cursor) {
      await updateEmailSyncCursor(cursor.id, {
        backfillCompletedAt: new Date(),
      })
    }

    const removed = await removeJobs(snapshot.removableJobs)

    const cancelledJobRuns = await markCancelledBackfillJobRunsFailed([
      ...removed.removedJobRunIds,
    ])

    const finalSnapshot = await listTargetJobs({
      userId: parsed.userId,
      oauthConnectionId: connection?.id ?? null,
    })

    console.log(
      JSON.stringify(
        {
          step: "done",
          userId: parsed.userId,
          oauthConnectionId: connection?.id ?? null,
          cursorId: cursor?.id ?? null,
          cursorMarkedCompleted: Boolean(cursor),
          removedPendingJobs: removed.removedJobIds.size,
          activeJobsLeftToDrain: snapshot.activeJobs.length,
          residualPendingJobsAfterMarkingComplete: finalSnapshot.removableJobs.length,
          markedFailedJobRuns: cancelledJobRuns.length,
          note: "In-flight emails can still finish. New backfill pages will not pick up more emails unless backfill is invoked manually again.",
        },
        null,
        2,
      ),
    )
  } finally {
    await queue.close()
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        step: "error",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
