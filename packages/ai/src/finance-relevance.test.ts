import assert from "node:assert/strict"
import test from "node:test"

import {
  buildFinanceRelevancePrompt,
  classifyFinanceRelevance,
  type FinanceRelevanceInput,
} from "./finance-relevance"

function buildFakeGenerator() {
  return async ({ prompt }: { prompt: string }) => {
    if (prompt.includes("Salary credited for March")) {
      return {
        object: {
          classification: "transactional_finance" as const,
          confidence: 0.97,
          reasonCode: "transaction_signal" as const,
        },
        usage: {
          inputTokens: 100,
          outputTokens: 15,
        },
        response: {
          id: "req-salary",
        },
      }
    }

    if (prompt.includes("Your HDFC Bank credit card statement")) {
      return {
        object: {
          classification: "obligation_finance" as const,
          confidence: 0.91,
          reasonCode: "obligation_signal" as const,
        },
        usage: {
          inputTokens: 98,
          outputTokens: 14,
        },
        response: {
          id: "req-statement",
        },
      }
    }

    if (prompt.includes("92 Diamonds credited for shopping on Amazon.in")) {
      return {
        object: {
          classification: "marketing_finance" as const,
          confidence: 0.95,
          reasonCode: "reward_or_loyalty_promo" as const,
        },
        usage: {
          inputTokens: 120,
          outputTokens: 13,
        },
        response: {
          id: "req-amazon",
        },
      }
    }

    return {
      object: {
        classification: "non_finance" as const,
        confidence: 0.84,
        reasonCode: "insufficient_finance_signal" as const,
      },
      usage: {
        inputTokens: 75,
        outputTokens: 11,
      },
      response: {
        id: "req-generic",
      },
    }
  }
}

test("buildFinanceRelevancePrompt includes reward and threshold guidance", () => {
  const prompt = buildFinanceRelevancePrompt({
    sender: "Amazon Prime <offers@amazon.in>",
    subject: "92 Diamonds credited for shopping on Amazon.in",
    snippet: "Spend above Rs 499 and use them in your next purchase.",
    labelIds: ["CATEGORY_PROMOTIONS"],
    timestamp: "2026-03-20T00:00:00.000Z",
    attachmentNames: [],
  })

  assert.match(prompt, /diamonds, points, coins/i)
  assert.match(prompt, /spend above rs 499/i)
  assert.match(prompt, /not transactional_finance/i)
})

test("classifyFinanceRelevance accepts transactional receipt metadata", async () => {
  const input: FinanceRelevanceInput = {
    sender: "ACME Payroll <payroll@acme.com>",
    subject: "Salary credited for March",
    snippet: "Your salary has been credited to your bank account.",
    labelIds: ["INBOX"],
    timestamp: "2026-03-20T00:00:00.000Z",
    attachmentNames: ["payslip.pdf"],
  }

  const decision = await classifyFinanceRelevance(input, {
    generateObjectImpl: buildFakeGenerator(),
    modelOverride: "test-model",
    now: (() => {
      let now = 0
      return () => {
        now += 25
        return now
      }
    })(),
  })

  assert.equal(decision.decision, "accept")
  assert.equal(decision.classification, "transactional_finance")
  assert.equal(decision.stage, "model")
  assert.equal(decision.score, 97)
  assert.deepEqual(decision.reasons, ["transaction_signal"])
  assert.equal(decision.metadata.promptVersion, "finance-relevance-v2")
  assert.equal(decision.metadata.requestId, "req-salary")
})

test("classifyFinanceRelevance accepts obligation metadata", async () => {
  const input: FinanceRelevanceInput = {
    sender: "HDFC Bank <alerts@hdfcbank.com>",
    subject: "Your HDFC Bank credit card statement is ready",
    snippet: "Payment due on 25 Mar 2026.",
    labelIds: ["INBOX"],
    timestamp: "2026-03-20T00:00:00.000Z",
    attachmentNames: ["statement.pdf"],
  }

  const decision = await classifyFinanceRelevance(input, {
    generateObjectImpl: buildFakeGenerator(),
    modelOverride: "test-model",
  })

  assert.equal(decision.decision, "accept")
  assert.equal(decision.classification, "obligation_finance")
  assert.deepEqual(decision.reasons, ["obligation_signal"])
})

test("classifyFinanceRelevance rejects promotional loyalty emails", async () => {
  const input: FinanceRelevanceInput = {
    sender: "Amazon Prime <offers@amazon.in>",
    subject: "92 Diamonds credited for shopping on Amazon.in",
    snippet: "Spend above Rs 499 and pay with UPI to continue shopping with this offer.",
    labelIds: ["CATEGORY_PROMOTIONS"],
    timestamp: "2026-03-20T00:00:00.000Z",
    attachmentNames: [],
  }

  const decision = await classifyFinanceRelevance(input, {
    generateObjectImpl: buildFakeGenerator(),
    modelOverride: "test-model",
  })

  assert.equal(decision.decision, "skip")
  assert.equal(decision.classification, "marketing_finance")
  assert.deepEqual(decision.reasons, ["reward_or_loyalty_promo"])
})

test("classifyFinanceRelevance rejects clearly unrelated mail", async () => {
  const input: FinanceRelevanceInput = {
    sender: "Events Team <hello@example.com>",
    subject: "Weekend digest",
    snippet: "Here are this week's community updates.",
    labelIds: ["CATEGORY_UPDATES"],
    timestamp: "2026-03-20T00:00:00.000Z",
    attachmentNames: [],
  }

  const decision = await classifyFinanceRelevance(input, {
    generateObjectImpl: buildFakeGenerator(),
    modelOverride: "test-model",
  })

  assert.equal(decision.decision, "skip")
  assert.equal(decision.classification, "non_finance")
  assert.deepEqual(decision.reasons, ["insufficient_finance_signal"])
})
