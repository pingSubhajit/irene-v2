import { z } from "zod"

import { createTrackedJobOptions, getOrCreateQueue, toBullJobId } from "./redis"

export const ENTITY_RESOLUTION_QUEUE_NAME = "entity-resolution"
export const EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME =
  "event.extract.instrument_observation"
export const INSTRUMENT_RESOLVE_JOB_NAME = "instrument.resolve"
export const INSTRUMENT_REPAIR_BACKFILL_JOB_NAME = "instrument.repair.backfill"

const trackedJobFields = {
  correlationId: z.string().min(1),
  jobRunId: z.string().uuid(),
  jobKey: z.string().min(1),
  requestedAt: z.string().datetime(),
  userId: z.string().min(1),
  source: z.enum(["worker", "web", "startup"]),
} as const

export const eventExtractInstrumentObservationJobPayloadSchema = z.object({
  ...trackedJobFields,
  financialEventId: z.string().uuid(),
})

export const instrumentResolveJobPayloadSchema = z.object({
  ...trackedJobFields,
  maskedIdentifier: z.string().min(4).max(8),
  triggerObservationId: z.string().uuid().optional(),
})

export const instrumentRepairBackfillJobPayloadSchema = z.object({
  ...trackedJobFields,
})

export type EventExtractInstrumentObservationJobPayload = z.infer<
  typeof eventExtractInstrumentObservationJobPayloadSchema
>
export type InstrumentResolveJobPayload = z.infer<typeof instrumentResolveJobPayloadSchema>
export type InstrumentRepairBackfillJobPayload = z.infer<
  typeof instrumentRepairBackfillJobPayloadSchema
>

export function getEntityResolutionQueue() {
  return getOrCreateQueue(ENTITY_RESOLUTION_QUEUE_NAME, "entityResolution")
}

export async function enqueueEventExtractInstrumentObservation(
  payload: EventExtractInstrumentObservationJobPayload,
) {
  const parsed = eventExtractInstrumentObservationJobPayloadSchema.parse(payload)

  return getEntityResolutionQueue().add(EVENT_EXTRACT_INSTRUMENT_OBSERVATION_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 20_000,
    }),
  })
}

export async function enqueueInstrumentResolve(payload: InstrumentResolveJobPayload) {
  const parsed = instrumentResolveJobPayloadSchema.parse(payload)

  return getEntityResolutionQueue().add(INSTRUMENT_RESOLVE_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 2,
      backoffMs: 30_000,
    }),
  })
}

export async function enqueueInstrumentRepairBackfill(
  payload: InstrumentRepairBackfillJobPayload,
) {
  const parsed = instrumentRepairBackfillJobPayloadSchema.parse(payload)

  return getEntityResolutionQueue().add(INSTRUMENT_REPAIR_BACKFILL_JOB_NAME, parsed, {
    ...createTrackedJobOptions({
      jobId: toBullJobId(parsed.jobKey),
      attempts: 1,
      backoffMs: 30_000,
    }),
  })
}

export async function getEntityResolutionQueueStats() {
  return getEntityResolutionQueue().getJobCounts(
    "active",
    "completed",
    "delayed",
    "failed",
    "paused",
    "prioritized",
    "waiting",
  )
}
