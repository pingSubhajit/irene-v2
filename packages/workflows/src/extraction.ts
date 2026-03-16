import { z } from "zod"

import { getOrCreateQueue, toBullJobId } from "./redis"

export const DOCUMENT_NORMALIZATION_QUEUE_NAME = "document-normalization"
export const AI_EXTRACTION_QUEUE_NAME = "ai-extraction"

export const DOCUMENT_NORMALIZE_JOB_NAME = "document.normalize"
export const DOCUMENT_EXTRACT_ROUTE_JOB_NAME = "document.extract.route"
export const DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME = "document.extract.structured"

const extractionBasePayloadSchema = z.object({
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  rawDocumentId: z.string().uuid(),
  source: z.enum(["worker", "web"]),
})

export const documentNormalizeJobPayloadSchema = extractionBasePayloadSchema

export const documentExtractRouteJobPayloadSchema = extractionBasePayloadSchema.extend({
  normalizationJobRunId: z.string().uuid().optional(),
})

export const documentExtractStructuredJobPayloadSchema =
  extractionBasePayloadSchema.extend({
    routeJobRunId: z.string().uuid(),
    routeModelRunId: z.string().uuid().optional(),
    routeLabel: z.enum([
      "purchase",
      "income",
      "subscription_charge",
      "emi_payment",
      "bill_payment",
      "refund",
      "transfer",
      "generic_finance",
    ]),
    routeConfidence: z.number().min(0).max(1),
    routeReasons: z.array(z.string()).default([]),
  })

export type DocumentNormalizeJobPayload = z.infer<
  typeof documentNormalizeJobPayloadSchema
>
export type DocumentExtractRouteJobPayload = z.infer<
  typeof documentExtractRouteJobPayloadSchema
>
export type DocumentExtractStructuredJobPayload = z.infer<
  typeof documentExtractStructuredJobPayloadSchema
>

export function getDocumentNormalizationQueue() {
  return getOrCreateQueue(DOCUMENT_NORMALIZATION_QUEUE_NAME, "documentNormalization")
}

export function getAiExtractionQueue() {
  return getOrCreateQueue(AI_EXTRACTION_QUEUE_NAME, "aiExtraction")
}

export async function enqueueDocumentNormalize(payload: DocumentNormalizeJobPayload) {
  const parsed = documentNormalizeJobPayloadSchema.parse(payload)

  return getDocumentNormalizationQueue().add(DOCUMENT_NORMALIZE_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueDocumentExtractRoute(payload: DocumentExtractRouteJobPayload) {
  const parsed = documentExtractRouteJobPayloadSchema.parse(payload)

  return getAiExtractionQueue().add(DOCUMENT_EXTRACT_ROUTE_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function enqueueDocumentExtractStructured(
  payload: DocumentExtractStructuredJobPayload,
) {
  const parsed = documentExtractStructuredJobPayloadSchema.parse(payload)

  return getAiExtractionQueue().add(DOCUMENT_EXTRACT_STRUCTURED_JOB_NAME, parsed, {
    jobId: toBullJobId(parsed.jobKey),
  })
}

export async function getDocumentNormalizationQueueStats() {
  return getDocumentNormalizationQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}

export async function getAiExtractionQueueStats() {
  return getAiExtractionQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
