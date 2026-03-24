export const RECONCILIATION_REPAIR_DELAY_MS = 30_000

type JobRunPayloadLike = {
  payloadJson?: Record<string, unknown> | null
}

export type RepairBatchScope = {
  rawDocumentIds: string[]
  extractedSignalIds: string[]
  financialEventIds: string[]
}

function asUuidLike(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

export function collectRepairBatchScope(jobRuns: JobRunPayloadLike[]): RepairBatchScope {
  const rawDocumentIds = new Set<string>()
  const extractedSignalIds = new Set<string>()
  const financialEventIds = new Set<string>()

  for (const jobRun of jobRuns) {
    const payload = jobRun.payloadJson

    if (!payload) {
      continue
    }

    const rawDocumentId = asUuidLike(payload.rawDocumentId)
    if (rawDocumentId) {
      rawDocumentIds.add(rawDocumentId)
    }

    const extractedSignalId = asUuidLike(payload.extractedSignalId)
    if (extractedSignalId) {
      extractedSignalIds.add(extractedSignalId)
    }

    const financialEventId = asUuidLike(payload.financialEventId)
    if (financialEventId) {
      financialEventIds.add(financialEventId)
    }
  }

  return {
    rawDocumentIds: [...rawDocumentIds],
    extractedSignalIds: [...extractedSignalIds],
    financialEventIds: [...financialEventIds],
  }
}

export function shouldScheduleReconciliationRepair(input: {
  acceptedTransactionalCount: number
  acceptedObligationCount: number
}) {
  return input.acceptedTransactionalCount + input.acceptedObligationCount > 0
}

export function chooseRepairMergeTarget(input: {
  currentEventId: string
  currentIsBankSettlement: boolean
  candidateEventId: string
  candidateIsBankSettlement: boolean
}) {
  if (input.currentIsBankSettlement && !input.candidateIsBankSettlement) {
    return input.currentEventId
  }

  if (!input.currentIsBankSettlement && input.candidateIsBankSettlement) {
    return input.candidateEventId
  }

  return input.candidateEventId
}
