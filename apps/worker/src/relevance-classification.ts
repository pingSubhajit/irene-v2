import { aiModels, aiPromptVersions, type FinanceRelevanceInput } from "@workspace/ai"

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
    relevanceModelRunId: string
  }) => Promise<void>
  warn: (message: string, context: Record<string, unknown>) => void
}

export type CandidateMessageOutcome =
  | "accepted_transactional"
  | "accepted_obligation"
  | "skipped_marketing"
  | "skipped_non_finance"

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
  const modelRun = await deps.createModelRun({
    userId: input.userId,
    taskType: "finance_relevance_classification",
    provider: "ai-gateway",
    modelName: aiModels.financeRelevanceClassifier,
    promptVersion: aiPromptVersions.financeRelevanceClassifier,
    status: "running",
  })

  try {
    const decision = await deps.classifyFinanceRelevance(
      metadataToClassifierInput(input.metadata),
    )

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

    if (decision.classification === "transactional_finance") {
      await deps.enqueueMessageIngest({
        userId: input.userId,
        oauthConnectionId: input.oauthConnectionId,
        cursorId: input.cursorId,
        correlationId: input.correlationId,
        providerMessageId: input.metadata.id,
        sourceKind: input.sourceKind,
        historyId: input.metadata.historyId,
        relevanceLabel: decision.classification,
        relevanceStage: decision.stage,
        relevanceScore: decision.score,
        relevanceReasons: decision.reasons,
        relevanceModelRunId: modelRun.id,
      })

      return "accepted_transactional"
    }

    if (decision.classification === "obligation_finance") {
      await deps.enqueueMessageIngest({
        userId: input.userId,
        oauthConnectionId: input.oauthConnectionId,
        cursorId: input.cursorId,
        correlationId: input.correlationId,
        providerMessageId: input.metadata.id,
        sourceKind: input.sourceKind,
        historyId: input.metadata.historyId,
        relevanceLabel: decision.classification,
        relevanceStage: decision.stage,
        relevanceScore: decision.score,
        relevanceReasons: decision.reasons,
        relevanceModelRunId: modelRun.id,
      })

      return "accepted_obligation"
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
