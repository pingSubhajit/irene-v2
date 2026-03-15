export { accounts, authSchema, sessions, users, verifications } from "./auth"
export {
  jobRuns,
  userSettings,
  type JobRunInsert,
  type JobRunSelect,
  type JobRunStatus,
  type UserSettingsInsert,
} from "./app"

import { authSchema } from "./auth"
import { jobRuns, userSettings } from "./app"

export const schema = {
  ...authSchema,
  userSettings,
  jobRuns,
}
