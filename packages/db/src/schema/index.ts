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
  type RawDocumentInsert,
  type RawDocumentRelevanceLabel,
  type RawDocumentRelevanceStage,
  type RawDocumentSelect,
  type RawDocumentSourceType,
} from "./ingestion"
export {
  extractedSignals,
  modelRuns,
  type ExtractedSignalCandidateEventType,
  type ExtractedSignalInsert,
  type ExtractedSignalSelect,
  type ExtractedSignalStatus,
  type ExtractedSignalType,
  type ModelRunInsert,
  type ModelRunSelect,
  type ModelRunStatus,
  type ModelRunTaskType,
} from "./extraction"

import { authSchema } from "./auth"
import { jobRuns, userSettings } from "./app"
import { extractedSignals, modelRuns } from "./extraction"
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
  modelRuns,
  extractedSignals,
}
