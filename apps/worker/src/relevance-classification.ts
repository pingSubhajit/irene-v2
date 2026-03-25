import { aiModels, aiPromptVersions, type FinanceRelevanceInput } from "@workspace/ai"
import { hashCanonicalJson } from "@workspace/db"

import type { FinanceRelevanceDecision } from "@workspace/ai"
import type { GmailMessageMetadata } from "@workspace/integrations"

export function metadataToClassifierInput(message: GmailMessageMetadata): FinanceRelevanceInput {
  return {
    sender: message.fromAddress,
    subject: message.subject,
    snippet: message.snippet,
    labelIds: message.labelIds,
    timestamp: message.internalDate?.toISOString() ?? null,
    attachmentNames: message.attachmentNames,
  }
}

type RelevanceModelRunUpdate = {
  status?: "queued" | "running" | "succeeded" | "failed"
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

type RelevanceClassifierDeps = {
  createModelRun: (input: {
    userId: string
    taskType: "finance_relevance_classification"
    provider: string
    modelName: string
    promptVersion: string
    status: "running"
  }) => Promise<{ id: string }>
  updateModelRun: (modelRunId: string, input: RelevanceModelRunUpdate) => Promise<unknown>
  classifyFinanceRelevance: (input: FinanceRelevanceInput) => Promise<FinanceRelevanceDecision>
  enqueueMessageIngest: (input: {
    userId: string
    oauthConnectionId: string
    cursorId: string
    correlationId: string
    providerMessageId: string
    sourceKind: "backfill" | "incremental"
    historyId?: string | null
    relevanceLabel: "transactional_finance" | "obligation_finance"
    relevanceStage: "model"
    relevanceScore: number
    relevanceReasons: string[]
    relevanceModelRunId?: string | null
  }) => Promise<void>
  getRelevanceCache: (input: {
    oauthConnectionId: string
    providerMessageId: string
  }) => Promise<{
    inputHash: string
    classification: CandidateClassification
    stage: "model"
    score: number
    reasonsJson: string[]
    promptVersion: string
    modelName: string
    provider: string
    modelRunId?: string | null
  } | null>
  upsertRelevanceCache: (input: {
    userId: string
    oauthConnectionId: string
    providerMessageId: string
    messageTimestamp: Date
    inputHash: string
    classification: CandidateClassification
    stage: "model"
    score: number
    reasonsJson: string[]
    promptVersion: string
    modelName: string
    provider: string
    modelRunId?: string | null
    lastEvaluatedAt: Date
  }) => Promise<unknown>
  getExistingRawDocument: (input: {
    oauthConnectionId: string
    providerMessageId: string
  }) => Promise<{ id: string } | null>
  info: (message: string, context: Record<string, unknown>) => void
  warn: (message: string, context: Record<string, unknown>) => void
}

type CandidateClassification =
  | "transactional_finance"
  | "obligation_finance"
  | "marketing_finance"
  | "non_finance"

export type CandidateMessageOutcome =
  | "accepted_transactional"
  | "accepted_obligation"
  | "skipped_marketing"
  | "skipped_non_finance"

export function buildFinanceRelevanceInputHash(input: FinanceRelevanceInput) {
  return hashCanonicalJson({
    classifierInput: input,
    promptVersion: aiPromptVersions.financeRelevanceClassifier,
    modelName: aiModels.financeRelevanceClassifier,
  })
}

function outcomeFromClassification(classification: CandidateClassification): CandidateMessageOutcome {
  switch (classification) {
    case "transactional_finance":
      return "accepted_transactional"
    case "obligation_finance":
      return "accepted_obligation"
    case "marketing_finance":
      return "skipped_marketing"
    default:
      return "skipped_non_finance"
  }
}

async function enqueueAcceptedMessage(
  input: {
    userId: string
    oauthConnectionId: string
    cursorId: string
    correlationId: string
    sourceKind: "backfill" | "incremental"
    metadata: GmailMessageMetadata
    classification: "transactional_finance" | "obligation_finance"
    stage: "model"
    score: number
    reasons: string[]
    relevanceModelRunId?: string | null
  },
  deps: Pick<RelevanceClassifierDeps, "enqueueMessageIngest" | "getExistingRawDocument">,
) {
  const existingRawDocument = await deps.getExistingRawDocument({
    oauthConnectionId: input.oauthConnectionId,
    providerMessageId: input.metadata.id,
  })

  if (existingRawDocument) {
    return outcomeFromClassification(input.classification)
  }

  await deps.enqueueMessageIngest({
    userId: input.userId,
    oauthConnectionId: input.oauthConnectionId,
    cursorId: input.cursorId,
    correlationId: input.correlationId,
    providerMessageId: input.metadata.id,
    sourceKind: input.sourceKind,
    historyId: input.metadata.historyId,
    relevanceLabel: input.classification,
    relevanceStage: input.stage,
    relevanceScore: input.score,
    relevanceReasons: input.reasons,
    relevanceModelRunId: input.relevanceModelRunId ?? null,
  })

  return outcomeFromClassification(input.classification)
}

export async function processCandidateMessageRelevance(
  input: {
    userId: string
    oauthConnectionId: string
    cursorId: string
    correlationId: string
    sourceKind: "backfill" | "incremental"
    metadata: GmailMessageMetadata
    currentAttempt: number
    maxAttempts: number
    jobId: string | number
  },
  deps: RelevanceClassifierDeps,
): Promise<CandidateMessageOutcome> {
  const classifierInput = metadataToClassifierInput(input.metadata)
  const inputHash = buildFinanceRelevanceInputHash(classifierInput)
  const cached = await deps.getRelevanceCache({
    oauthConnectionId: input.oauthConnectionId,
    providerMessageId: input.metadata.id,
  })

  if (cached && cached.inputHash === inputHash) {
    deps.info("relevance_cache_hit", {
      userId: input.userId,
      oauthConnectionId: input.oauthConnectionId,
      providerMessageId: input.metadata.id,
      classification: cached.classification,
    })

    if (
      cached.classification === "transactional_finance" ||
      cached.classification === "obligation_finance"
    ) {
      return enqueueAcceptedMessage(
        {
          userId: input.userId,
          oauthConnectionId: input.oauthConnectionId,
          cursorId: input.cursorId,
          correlationId: input.correlationId,
          sourceKind: input.sourceKind,
          metadata: input.metadata,
          classification: cached.classification,
          stage: cached.stage,
          score: cached.score,
          reasons: cached.reasonsJson,
          relevanceModelRunId: cached.modelRunId ?? null,
        },
        deps,
      )
    }

    return outcomeFromClassification(cached.classification)
  }

  deps.info("relevance_cache_miss", {
    userId: input.userId,
    oauthConnectionId: input.oauthConnectionId,
    providerMessageId: input.metadata.id,
    reason: cached ? "input_changed" : "missing_cache",
  })

  const modelRun = await deps.createModelRun({
    userId: input.userId,
    taskType: "finance_relevance_classification",
    provider: "ai-gateway",
    modelName: aiModels.financeRelevanceClassifier,
    promptVersion: aiPromptVersions.financeRelevanceClassifier,
    status: "running",
  })

  try {
    const decision = await deps.classifyFinanceRelevance(classifierInput)

    await deps.updateModelRun(modelRun.id, {
      status: "succeeded",
      provider: decision.metadata.provider,
      modelName: decision.metadata.modelName,
      promptVersion: decision.metadata.promptVersion,
      inputTokens: decision.metadata.inputTokens,
      outputTokens: decision.metadata.outputTokens,
      latencyMs: decision.metadata.latencyMs,
      requestId: decision.metadata.requestId,
    })

    await deps.upsertRelevanceCache({
      userId: input.userId,
      oauthConnectionId: input.oauthConnectionId,
      providerMessageId: input.metadata.id,
      messageTimestamp: input.metadata.internalDate ?? new Date(),
      inputHash,
      classification: decision.classification,
      stage: decision.stage,
      score: decision.score,
      reasonsJson: decision.reasons,
      promptVersion: decision.metadata.promptVersion,
      modelName: decision.metadata.modelName,
      provider: decision.metadata.provider,
      modelRunId: modelRun.id,
      lastEvaluatedAt: new Date(),
    })

    if (decision.classification === "transactional_finance") {
      return enqueueAcceptedMessage(
        {
          userId: input.userId,
          oauthConnectionId: input.oauthConnectionId,
          cursorId: input.cursorId,
          correlationId: input.correlationId,
          sourceKind: input.sourceKind,
          metadata: input.metadata,
          classification: decision.classification,
          stage: decision.stage,
          score: decision.score,
          reasons: decision.reasons,
          relevanceModelRunId: modelRun.id,
        },
        deps,
      )
    }

    if (decision.classification === "obligation_finance") {
      return enqueueAcceptedMessage(
        {
          userId: input.userId,
          oauthConnectionId: input.oauthConnectionId,
          cursorId: input.cursorId,
          correlationId: input.correlationId,
          sourceKind: input.sourceKind,
          metadata: input.metadata,
          classification: decision.classification,
          stage: decision.stage,
          score: decision.score,
          reasons: decision.reasons,
          relevanceModelRunId: modelRun.id,
        },
        deps,
      )
    }

    return decision.classification === "marketing_finance"
      ? "skipped_marketing"
      : "skipped_non_finance"
  } catch (error) {
    await deps.updateModelRun(modelRun.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown classifier failure",
    })

    if (input.currentAttempt >= input.maxAttempts) {
      deps.warn("Skipping Gmail message after relevance classifier retries exhausted", {
        jobId: input.jobId,
        messageId: input.metadata.id,
      })

      return "skipped_non_finance"
    }

    throw error
  }
}

export async function linkAcceptedRelevanceModelRun(
  input: {
    relevanceModelRunId?: string | null
    rawDocumentId: string
  },
  deps: {
    updateModelRun: (modelRunId: string, input: RelevanceModelRunUpdate) => Promise<unknown>
    warn: (message: string, context: Record<string, unknown>) => void
  },
) {
  if (!input.relevanceModelRunId) {
    return
  }

  const updated = await deps.updateModelRun(input.relevanceModelRunId, {
    rawDocumentId: input.rawDocumentId,
  })

  if (!updated) {
    deps.warn("Failed to link relevance classifier run to raw document", {
      modelRunId: input.relevanceModelRunId,
      rawDocumentId: input.rawDocumentId,
    })
  }
}
