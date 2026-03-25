import assert from "node:assert/strict"
import test from "node:test"

import { aiModels, aiPromptVersions, type FinanceRelevanceDecision } from "@workspace/ai"
import type { GmailMessageMetadata } from "@workspace/integrations"

import {
  buildFinanceRelevanceInputHash,
  linkAcceptedRelevanceModelRun,
  processCandidateMessageRelevance,
} from "./relevance-classification"

function buildMetadata(overrides: Partial<GmailMessageMetadata> = {}): GmailMessageMetadata {
  return {
    id: "message-1",
    threadId: "thread-1",
    historyId: "history-1",
    internalDate: new Date("2026-03-20T00:00:00.000Z"),
    snippet: "Payment received",
    labelIds: ["INBOX"],
    subject: "Payment received",
    fromAddress: "sender@example.com",
    toAddress: "user@example.com",
    attachmentNames: [],
    ...overrides,
  }
}

function buildDecision(
  overrides: Partial<FinanceRelevanceDecision> = {},
): FinanceRelevanceDecision {
  return {
    decision: "accept",
    classification: "transactional_finance",
    stage: "model",
    score: 93,
    reasons: ["transaction_signal"],
    modelResult: {
      classification: "transactional_finance",
      confidence: 0.93,
      reasonCode: "transaction_signal",
    },
    metadata: {
      provider: "ai-gateway",
      modelName: "google/gemini-3-flash",
      promptVersion: "finance-relevance-v2",
      inputTokens: 125,
      outputTokens: 14,
      latencyMs: 320,
      requestId: "req-123",
    },
    ...overrides,
  }
}

test("accepted classification creates a model run, enqueues ingest, and links the raw document", async () => {
  const createCalls: Array<Record<string, unknown>> = []
  const updateCalls: Array<{ id: string; input: Record<string, unknown> }> = []
  const enqueueCalls: Array<Record<string, unknown>> = []
  const warnings: Array<{ message: string; context: Record<string, unknown> }> = []

  const outcome = await processCandidateMessageRelevance(
    {
      userId: "user-1",
      oauthConnectionId: "oauth-1",
      cursorId: "cursor-1",
      correlationId: "corr-1",
      sourceKind: "incremental",
      metadata: buildMetadata(),
      currentAttempt: 1,
      maxAttempts: 3,
      jobId: "job-1",
    },
    {
      createModelRun: async (input) => {
        createCalls.push(input)
        return { id: "model-run-1" }
      },
      updateModelRun: async (id, input) => {
        updateCalls.push({ id, input })
        return { id }
      },
      classifyFinanceRelevance: async () => buildDecision(),
      enqueueMessageIngest: async (input) => {
        enqueueCalls.push(input)
      },
      getRelevanceCache: async () => null,
      upsertRelevanceCache: async () => undefined,
      getExistingRawDocument: async () => null,
      info: () => {},
      warn: (message, context) => {
        warnings.push({ message, context })
      },
    },
  )

  assert.equal(outcome, "accepted_transactional")
  assert.deepEqual(createCalls, [
    {
      userId: "user-1",
      taskType: "finance_relevance_classification",
      provider: "ai-gateway",
      modelName: aiModels.financeRelevanceClassifier,
      promptVersion: aiPromptVersions.financeRelevanceClassifier,
      status: "running",
    },
  ])
  assert.deepEqual(updateCalls[0], {
    id: "model-run-1",
    input: {
      status: "succeeded",
      provider: "ai-gateway",
      modelName: "google/gemini-3-flash",
      promptVersion: "finance-relevance-v2",
      inputTokens: 125,
      outputTokens: 14,
      latencyMs: 320,
      requestId: "req-123",
    },
  })
  assert.equal(enqueueCalls.length, 1)
  assert.deepEqual(enqueueCalls[0], {
    userId: "user-1",
    oauthConnectionId: "oauth-1",
    cursorId: "cursor-1",
    correlationId: "corr-1",
    providerMessageId: "message-1",
    sourceKind: "incremental",
    historyId: "history-1",
    relevanceLabel: "transactional_finance",
    relevanceStage: "model",
    relevanceScore: 93,
    relevanceReasons: ["transaction_signal"],
    relevanceModelRunId: "model-run-1",
  })
  assert.equal(warnings.length, 0)

  await linkAcceptedRelevanceModelRun(
    {
      relevanceModelRunId: "model-run-1",
      rawDocumentId: "raw-document-1",
    },
    {
      updateModelRun: async (id, input) => {
        updateCalls.push({ id, input })
        return { id, rawDocumentId: "raw-document-1" }
      },
      warn: (message, context) => {
        warnings.push({ message, context })
      },
    },
  )

  assert.deepEqual(updateCalls[1], {
    id: "model-run-1",
    input: {
      rawDocumentId: "raw-document-1",
    },
  })
})

test("marketing classifications are skipped without enqueueing ingest", async () => {
  const updateCalls: Array<{ id: string; input: Record<string, unknown> }> = []
  const enqueueCalls: Array<Record<string, unknown>> = []

  const outcome = await processCandidateMessageRelevance(
    {
      userId: "user-1",
      oauthConnectionId: "oauth-1",
      cursorId: "cursor-1",
      correlationId: "corr-1",
      sourceKind: "backfill",
      metadata: buildMetadata({
        subject: "92 Diamonds credited for shopping on Amazon.in",
      }),
      currentAttempt: 1,
      maxAttempts: 3,
      jobId: "job-1",
    },
    {
      createModelRun: async () => ({ id: "model-run-2" }),
      updateModelRun: async (id, input) => {
        updateCalls.push({ id, input })
        return { id }
      },
      classifyFinanceRelevance: async () =>
        buildDecision({
          decision: "skip",
          classification: "marketing_finance",
          score: 95,
          reasons: ["reward_or_loyalty_promo"],
          modelResult: {
            classification: "marketing_finance",
            confidence: 0.95,
            reasonCode: "reward_or_loyalty_promo",
          },
        }),
      enqueueMessageIngest: async (input) => {
        enqueueCalls.push(input)
      },
      getRelevanceCache: async () => null,
      upsertRelevanceCache: async () => undefined,
      getExistingRawDocument: async () => null,
      info: () => {},
      warn: () => {},
    },
  )

  assert.equal(outcome, "skipped_marketing")
  assert.equal(enqueueCalls.length, 0)
  assert.equal(updateCalls[0]?.input.status, "succeeded")
})

test("classifier failures update the model run and rethrow before the final attempt", async () => {
  const updateCalls: Array<{ id: string; input: Record<string, unknown> }> = []

  await assert.rejects(
    () =>
      processCandidateMessageRelevance(
        {
          userId: "user-1",
          oauthConnectionId: "oauth-1",
          cursorId: "cursor-1",
          correlationId: "corr-1",
          sourceKind: "incremental",
          metadata: buildMetadata(),
          currentAttempt: 1,
          maxAttempts: 3,
          jobId: "job-1",
        },
        {
          createModelRun: async () => ({ id: "model-run-3" }),
          updateModelRun: async (id, input) => {
            updateCalls.push({ id, input })
            return { id }
          },
          classifyFinanceRelevance: async () => {
            throw new Error("Gateway timeout")
          },
          enqueueMessageIngest: async () => undefined,
          getRelevanceCache: async () => null,
          upsertRelevanceCache: async () => undefined,
          getExistingRawDocument: async () => null,
          info: () => {},
          warn: () => {},
        },
      ),
    /Gateway timeout/,
  )

  assert.deepEqual(updateCalls, [
    {
      id: "model-run-3",
      input: {
        status: "failed",
        errorMessage: "Gateway timeout",
      },
    },
  ])
})

test("classifier failures are skipped after retries are exhausted", async () => {
  const updateCalls: Array<{ id: string; input: Record<string, unknown> }> = []
  const warnings: Array<{ message: string; context: Record<string, unknown> }> = []

  const outcome = await processCandidateMessageRelevance(
    {
      userId: "user-1",
      oauthConnectionId: "oauth-1",
      cursorId: "cursor-1",
      correlationId: "corr-1",
      sourceKind: "incremental",
      metadata: buildMetadata(),
      currentAttempt: 3,
      maxAttempts: 3,
      jobId: "job-1",
    },
    {
      createModelRun: async () => ({ id: "model-run-4" }),
      updateModelRun: async (id, input) => {
        updateCalls.push({ id, input })
        return { id }
      },
      classifyFinanceRelevance: async () => {
        throw new Error("Gateway timeout")
      },
      enqueueMessageIngest: async () => undefined,
      getRelevanceCache: async () => null,
      upsertRelevanceCache: async () => undefined,
      getExistingRawDocument: async () => null,
      info: () => {},
      warn: (message, context) => {
        warnings.push({ message, context })
      },
    },
  )

  assert.equal(outcome, "skipped_non_finance")
  assert.deepEqual(updateCalls, [
    {
      id: "model-run-4",
      input: {
        status: "failed",
        errorMessage: "Gateway timeout",
      },
    },
  ])
  assert.deepEqual(warnings, [
    {
      message: "Skipping Gmail message after relevance classifier retries exhausted",
      context: {
        jobId: "job-1",
        messageId: "message-1",
      },
    },
  ])
})

test("cache hit skips classifier and model run for skipped messages", async () => {
  let classifyCalled = false
  let createCalled = false

  const metadata = buildMetadata({
    subject: "Shipping update",
    snippet: "Out for delivery",
  })

  const outcome = await processCandidateMessageRelevance(
    {
      userId: "user-1",
      oauthConnectionId: "oauth-1",
      cursorId: "cursor-1",
      correlationId: "corr-1",
      sourceKind: "incremental",
      metadata,
      currentAttempt: 1,
      maxAttempts: 3,
      jobId: "job-1",
    },
    {
      createModelRun: async () => {
        createCalled = true
        return { id: "model-run-cache-miss" }
      },
      updateModelRun: async () => undefined,
      classifyFinanceRelevance: async () => {
        classifyCalled = true
        return buildDecision()
      },
      enqueueMessageIngest: async () => undefined,
      getRelevanceCache: async () => ({
        inputHash: buildFinanceRelevanceInputHash({
          sender: metadata.fromAddress,
          subject: metadata.subject,
          snippet: metadata.snippet,
          labelIds: metadata.labelIds,
          timestamp: metadata.internalDate?.toISOString() ?? null,
          attachmentNames: metadata.attachmentNames,
        }),
        classification: "non_finance",
        stage: "model",
        score: 99,
        reasonsJson: ["shipping_update"],
        promptVersion: "finance-relevance-v2",
        modelName: "google/gemini-2.5-flash-lite",
        provider: "ai-gateway",
        modelRunId: null,
      }),
      upsertRelevanceCache: async () => undefined,
      getExistingRawDocument: async () => null,
      info: () => {},
      warn: () => {},
    },
  )

  assert.equal(outcome, "skipped_non_finance")
  assert.equal(classifyCalled, false)
  assert.equal(createCalled, false)
})

test("cache hit enqueues accepted message without a fresh model run when raw document is missing", async () => {
  const enqueueCalls: Array<Record<string, unknown>> = []
  const metadata = buildMetadata()

  const outcome = await processCandidateMessageRelevance(
    {
      userId: "user-1",
      oauthConnectionId: "oauth-1",
      cursorId: "cursor-1",
      correlationId: "corr-1",
      sourceKind: "backfill",
      metadata,
      currentAttempt: 1,
      maxAttempts: 3,
      jobId: "job-1",
    },
    {
      createModelRun: async () => {
        throw new Error("should not create model run")
      },
      updateModelRun: async () => undefined,
      classifyFinanceRelevance: async () => {
        throw new Error("should not classify")
      },
      enqueueMessageIngest: async (payload) => {
        enqueueCalls.push(payload)
      },
      getRelevanceCache: async () => ({
        inputHash: buildFinanceRelevanceInputHash({
          sender: metadata.fromAddress,
          subject: metadata.subject,
          snippet: metadata.snippet,
          labelIds: metadata.labelIds,
          timestamp: metadata.internalDate?.toISOString() ?? null,
          attachmentNames: metadata.attachmentNames,
        }),
        classification: "transactional_finance",
        stage: "model",
        score: 93,
        reasonsJson: ["transaction_signal"],
        promptVersion: "finance-relevance-v2",
        modelName: "google/gemini-2.5-flash-lite",
        provider: "ai-gateway",
        modelRunId: null,
      }),
      upsertRelevanceCache: async () => undefined,
      getExistingRawDocument: async () => null,
      info: () => {},
      warn: () => {},
    },
  )

  assert.equal(outcome, "accepted_transactional")
  assert.equal(enqueueCalls.length, 1)
  assert.equal(enqueueCalls[0]?.relevanceModelRunId, null)
})

test("cache hit skips ingest when raw document already exists", async () => {
  let enqueueCount = 0
  const metadata = buildMetadata()

  const outcome = await processCandidateMessageRelevance(
    {
      userId: "user-1",
      oauthConnectionId: "oauth-1",
      cursorId: "cursor-1",
      correlationId: "corr-1",
      sourceKind: "incremental",
      metadata,
      currentAttempt: 1,
      maxAttempts: 3,
      jobId: "job-1",
    },
    {
      createModelRun: async () => {
        throw new Error("should not create model run")
      },
      updateModelRun: async () => undefined,
      classifyFinanceRelevance: async () => {
        throw new Error("should not classify")
      },
      enqueueMessageIngest: async () => {
        enqueueCount += 1
      },
      getRelevanceCache: async () => ({
        inputHash: buildFinanceRelevanceInputHash({
          sender: metadata.fromAddress,
          subject: metadata.subject,
          snippet: metadata.snippet,
          labelIds: metadata.labelIds,
          timestamp: metadata.internalDate?.toISOString() ?? null,
          attachmentNames: metadata.attachmentNames,
        }),
        classification: "obligation_finance",
        stage: "model",
        score: 91,
        reasonsJson: ["obligation_signal"],
        promptVersion: "finance-relevance-v2",
        modelName: "google/gemini-2.5-flash-lite",
        provider: "ai-gateway",
        modelRunId: "model-run-existing",
      }),
      upsertRelevanceCache: async () => undefined,
      getExistingRawDocument: async () => ({ id: "raw-1" }),
      info: () => {},
      warn: () => {},
    },
  )

  assert.equal(outcome, "accepted_obligation")
  assert.equal(enqueueCount, 0)
})
