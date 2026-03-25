import { schedules } from "@trigger.dev/sdk"

import { enqueueScheduledFxRateWarmup } from "../apps/web/lib/cron-jobs"

export const fxRateWarmupCron = schedules.task({
  id: "fx-rate-warmup-cron",
  cron: "10 0 * * *",
  run: async () => {
    return enqueueScheduledFxRateWarmup()
  },
})
