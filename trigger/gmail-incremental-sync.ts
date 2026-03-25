import { schedules } from "@trigger.dev/sdk"

import { enqueueScheduledGmailIncrementalSyncJobs } from "../apps/web/lib/cron-jobs"

export const gmailIncrementalSyncCron = schedules.task({
  id: "gmail-incremental-sync-cron",
  cron: "*/15 * * * *",
  run: async () => {
    return enqueueScheduledGmailIncrementalSyncJobs()
  },
})
