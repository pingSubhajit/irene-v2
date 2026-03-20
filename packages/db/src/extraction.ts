import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "./client"
import {
  documentAttachments,
  extractedSignals,
  modelRuns,
  rawDocuments,
  type DocumentAttachmentParseStatus,
  type ExtractedSignalInsert,
  type ModelRunStatus,
  type ModelRunTaskType,
} from "./schema"

type CreateModelRunInput = {
  userId: string
  rawDocumentId?: string | null
  taskType: ModelRunTaskType
  provider: string
  modelName: string
  promptVersion: string
  status?: ModelRunStatus
  inputTokens?: number | null
  outputTokens?: number | null
  latencyMs?: number | null
  requestId?: string | null
  errorMessage?: string | null
}

export async function createModelRun(input: CreateModelRunInput) {
  const [modelRun] = await db
    .insert(modelRuns)
    .values({
      userId: input.userId,
      rawDocumentId: input.rawDocumentId ?? null,
      taskType: input.taskType,
      provider: input.provider,
      modelName: input.modelName,
      promptVersion: input.promptVersion,
      status: input.status ?? "running",
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      latencyMs: input.latencyMs ?? null,
      requestId: input.requestId ?? null,
      errorMessage: input.errorMessage ?? null,
    })
    .returning()

  if (!modelRun) {
    throw new Error("Failed to create model_run")
  }

  return modelRun
}

type UpdateModelRunInput = {
  status?: ModelRunStatus
  provider?: string
  modelName?: string
  promptVersion?: string
  inputTokens?: number | null
  outputTokens?: number | null
  latencyMs?: number | null
  requestId?: string | null
  errorMessage?: string | null
  rawDocumentId?: string | null
}

export async function updateModelRun(modelRunId: string, input: UpdateModelRunInput) {
  const [modelRun] = await db
    .update(modelRuns)
    .set({
      status: input.status ?? undefined,
      provider: input.provider,
      modelName: input.modelName,
      promptVersion: input.promptVersion,
      inputTokens: input.inputTokens ?? undefined,
      outputTokens: input.outputTokens ?? undefined,
      latencyMs: input.latencyMs ?? undefined,
      requestId: input.requestId ?? undefined,
      errorMessage: input.errorMessage ?? undefined,
      rawDocumentId:
        input.rawDocumentId === null ? null : (input.rawDocumentId ?? undefined),
    })
    .where(eq(modelRuns.id, modelRunId))
    .returning()

  return modelRun ?? null
}

export async function createExtractedSignals(input: ExtractedSignalInsert[]) {
  if (input.length === 0) {
    return []
  }

  return db.insert(extractedSignals).values(input).returning()
}

export async function hasExtractedSignalsForRawDocument(rawDocumentId: string) {
  const [signal] = await db
    .select({ id: extractedSignals.id })
    .from(extractedSignals)
    .where(eq(extractedSignals.rawDocumentId, rawDocumentId))
    .limit(1)

  return Boolean(signal)
}

export async function getRawDocumentById(rawDocumentId: string) {
  const [rawDocument] = await db
    .select()
    .from(rawDocuments)
    .where(eq(rawDocuments.id, rawDocumentId))
    .limit(1)

  return rawDocument ?? null
}

export async function listRawDocumentsByIds(rawDocumentIds: string[]) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(rawDocuments)
    .where(inArray(rawDocuments.id, rawDocumentIds))
}

export async function updateRawDocumentBodyText(rawDocumentId: string, bodyText: string) {
  const [rawDocument] = await db
    .update(rawDocuments)
    .set({
      bodyText,
    })
    .where(eq(rawDocuments.id, rawDocumentId))
    .returning()

  return rawDocument ?? null
}

export async function listAttachmentsForRawDocument(rawDocumentId: string) {
  return db
    .select()
    .from(documentAttachments)
    .where(eq(documentAttachments.rawDocumentId, rawDocumentId))
    .orderBy(desc(documentAttachments.createdAt))
}

type UpdateAttachmentParseResultInput = {
  parseStatus: DocumentAttachmentParseStatus
  parsedText?: string | null
}

export async function updateDocumentAttachmentParseResult(
  attachmentId: string,
  input: UpdateAttachmentParseResultInput,
) {
  const [attachment] = await db
    .update(documentAttachments)
    .set({
      parseStatus: input.parseStatus,
      parsedText: input.parsedText ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(documentAttachments.id, attachmentId))
    .returning()

  return attachment ?? null
}

export async function listRecentModelRunsForUser(userId: string, limit = 20) {
  return db
    .select()
    .from(modelRuns)
    .where(eq(modelRuns.userId, userId))
    .orderBy(desc(modelRuns.createdAt))
    .limit(limit)
}

export async function listRecentExtractedSignalsForUser(userId: string, limit = 20) {
  return db
    .select()
    .from(extractedSignals)
    .where(eq(extractedSignals.userId, userId))
    .orderBy(desc(extractedSignals.createdAt))
    .limit(limit)
}

export async function countExtractedSignalsForUser(userId: string) {
  const rows = await db
    .select({ id: extractedSignals.id })
    .from(extractedSignals)
    .where(eq(extractedSignals.userId, userId))

  return rows.length
}

export async function listModelRunsForRawDocumentIds(rawDocumentIds: string[]) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(modelRuns)
    .where(inArray(modelRuns.rawDocumentId, rawDocumentIds))
    .orderBy(desc(modelRuns.createdAt))
}

export async function listExtractedSignalsForRawDocumentIds(rawDocumentIds: string[]) {
  if (rawDocumentIds.length === 0) {
    return []
  }

  return db
    .select()
    .from(extractedSignals)
    .where(inArray(extractedSignals.rawDocumentId, rawDocumentIds))
    .orderBy(desc(extractedSignals.createdAt))
}

export async function listRecentExtractionFailuresForUser(userId: string, limit = 20) {
  return db
    .select()
    .from(modelRuns)
    .where(and(eq(modelRuns.userId, userId), eq(modelRuns.status, "failed")))
    .orderBy(desc(modelRuns.createdAt))
    .limit(limit)
}
