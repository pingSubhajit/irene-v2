export { accounts, authSchema, sessions, users, verifications } from "./auth"
export {
  jobRuns,
  userSettings,
  type JobRunInsert,
  type JobRunSelect,
  type JobRunStatus,
  type UserSettingsInsert,
} from "./app"
export {
  documentAttachments,
  emailSyncCursors,
  oauthConnections,
  rawDocuments,
  type DocumentAttachmentInsert,
  type DocumentAttachmentParseStatus,
  type DocumentAttachmentSelect,
  type EmailSyncCursorSelect,
  type OauthConnectionInsert,
  type OauthConnectionSelect,
  type OauthConnectionStatus,
  type RawDocumentSelect,
  type RawDocumentSourceType,
} from "./ingestion"

import { authSchema } from "./auth"
import { jobRuns, userSettings } from "./app"
import {
  documentAttachments,
  emailSyncCursors,
  oauthConnections,
  rawDocuments,
} from "./ingestion"

export const schema = {
  ...authSchema,
  userSettings,
  jobRuns,
  oauthConnections,
  emailSyncCursors,
  rawDocuments,
  documentAttachments,
}
