import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"

import { aiModels, aiPromptVersions } from "./config"
import { generateStructuredObject } from "./object-generation"

const providerName = "ai-gateway"

const actionSchema = z
  .object({
    type: z.enum([
      "navigate",
      "open_review_queue",
      "refresh_advice",
      "open_goal",
      "open_activity_filtered",
      "open_settings_subpage",
      "open_accounts_baseline",
    ]),
    label: z.string().min(2).max(80),
    href: z.string().min(1).max(240).optional().nullable(),
    goalId: z.string().uuid().optional().nullable(),
    subpage: z.string().min(1).max(120).optional().nullable(),
    view: z
      .enum(["all", "outflow", "inflow", "review", "subscriptions", "emis", "income"])
      .optional()
      .nullable(),
    merchantIds: z.array(z.string().uuid()).max(6).optional().nullable(),
    eventTypes: z.array(z.string().min(1).max(64)).max(6).optional().nullable(),
  })
  .strict()

export const adviceDecisionSchema = z.object({
  adviceItems: z
    .array(
      z
        .object({
          issueType: z.enum([
            "low_cash_projection",
            "rising_recurring_obligations",
            "delayed_income",
            "discretionary_overspending",
            "goal_slippage",
            "review_backlog",
          ]),
          priority: z.number().int().min(1).max(3),
          title: z.string().min(6).max(120),
          summary: z.string().min(12).max(240),
          detail: z.string().min(18).max(520),
          whyNow: z.string().min(8).max(220).nullable().optional(),
          evidenceRefs: z.array(z.string().min(1).max(120)).max(10),
          shouldCreateAdvice: z.boolean(),
          primaryAction: actionSchema.nullable().optional(),
          secondaryAction: actionSchema.nullable().optional(),
          reasonNoAction: z.string().min(4).max(180).nullable().optional(),
          dedupeKeyHint: z.string().min(2).max(120),
        })
        .strict(),
    )
    .max(6),
})

export type AdviceDecisionSet = z.infer<typeof adviceDecisionSchema>
export type AdviceDecisionCandidate = AdviceDecisionSet["adviceItems"][number]

export const adviceRankingSchema = z.object({
  rankedAdvice: z
    .array(
      z.object({
        adviceItemId: z.string().uuid(),
        position: z.number().int().min(1).max(3),
        score: z.number().min(0).max(1),
        reason: z.string().min(8).max(200).nullable().optional(),
      }),
    )
    .max(3),
})

export type AdviceRanking = z.infer<typeof adviceRankingSchema>

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

function coerceAction(raw: unknown) {
  const parsed = actionSchema.safeParse(raw)
  if (!parsed.success) {
    return null
  }

  return parsed.data
}

function coerceDecisionSet(raw: unknown): AdviceDecisionSet | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const items = Array.isArray((raw as { adviceItems?: unknown }).adviceItems)
    ? (raw as { adviceItems: unknown[] }).adviceItems
    : null

  if (!items) {
    return null
  }

  const normalizedItems = items
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null
      }

      const row = entry as Record<string, unknown>
      const issueType =
        typeof row.issueType === "string" ? row.issueType : null
      const priority =
        row.priority === 1 || row.priority === 2 || row.priority === 3
          ? row.priority
          : 2
      const title = typeof row.title === "string" ? row.title.trim() : ""
      const summary = typeof row.summary === "string" ? row.summary.trim() : ""
      const detail = typeof row.detail === "string" ? row.detail.trim() : ""
      const whyNow =
        typeof row.whyNow === "string" && row.whyNow.trim().length > 0
          ? row.whyNow.trim()
          : null
      const evidenceRefs = Array.isArray(row.evidenceRefs)
        ? row.evidenceRefs.filter((value): value is string => typeof value === "string").slice(0, 10)
        : []
      const shouldCreateAdvice = Boolean(row.shouldCreateAdvice)
      const dedupeKeyHint =
        typeof row.dedupeKeyHint === "string" ? row.dedupeKeyHint.trim() : ""
      const reasonNoAction =
        typeof row.reasonNoAction === "string" && row.reasonNoAction.trim().length > 0
          ? row.reasonNoAction.trim()
          : null

      if (
        !issueType ||
        ![
          "low_cash_projection",
          "rising_recurring_obligations",
          "delayed_income",
          "discretionary_overspending",
          "goal_slippage",
          "review_backlog",
        ].includes(issueType) ||
        title.length < 6 ||
        summary.length < 12 ||
        detail.length < 18 ||
        dedupeKeyHint.length < 2
      ) {
        return null
      }

      return {
        issueType: issueType as AdviceDecisionCandidate["issueType"],
        priority,
        title,
        summary,
        detail,
        whyNow,
        evidenceRefs,
        shouldCreateAdvice,
        primaryAction: coerceAction(row.primaryAction ?? null),
        secondaryAction: coerceAction(row.secondaryAction ?? null),
        reasonNoAction,
        dedupeKeyHint,
      } satisfies {
        issueType: AdviceDecisionCandidate["issueType"]
        priority: number
        title: string
        summary: string
        detail: string
        whyNow: string | null
        evidenceRefs: string[]
        shouldCreateAdvice: boolean
        primaryAction: AdviceDecisionCandidate["primaryAction"]
        secondaryAction: AdviceDecisionCandidate["secondaryAction"]
        reasonNoAction: string | null
        dedupeKeyHint: string
      }
    })
    .filter((entry) => entry !== null)

  const parsed = adviceDecisionSchema.safeParse({
    adviceItems: normalizedItems,
  })

  return parsed.success ? parsed.data : null
}

export async function generateAdviceDecisionsWithAi(input: {
  promptContext: Record<string, unknown>
  memorySummary?: string[]
}) {
  const gateway = getGatewayProvider()
  const prompt = [
    "You are generating grounded financial advice for a personal finance app.",
    "You are given structured financial context and a candidate issue list assembled from the app.",
    "Decide whether each situation deserves surfaced advice right now. Prefer fewer, stronger advice items.",
    "Only use facts present in the supplied context.",
    "Do not invent balances, currencies, merchants, dates, causes, or recommended actions.",
    "Respect the currency and formatted amount labels already provided.",
    "If both minor-unit values and formatted labels are present, prefer the formatted labels in user-facing copy.",
    "Never assume USD by default.",
    "Use calm, operational language. Avoid generic coaching.",
    "It is acceptable to return zero advice items.",
    "Set shouldCreateAdvice=false for informational situations that do not deserve a surfaced card right now.",
    "Choose actions only from the provided action catalog. If nothing is clearly applicable, leave actions null and explain briefly in reasonNoAction.",
    "Do not force an action just because an advice item exists.",
    "",
    "Action catalog:",
    "- navigate: use only for an explicit href already listed in context",
    "- open_review_queue: only when the review backlog is material",
    "- refresh_advice: only when refreshing is genuinely the next step",
    "- open_goal: only when a referenced goal exists in context",
    "- open_activity_filtered: only when the provided activity filters are concrete and already supported in context",
    "- open_settings_subpage: only when the referenced settings route exists in context",
    "- open_accounts_baseline: only when the accounts baseline route is the relevant next place",
    "",
    "Structured context:",
    JSON.stringify(input.promptContext, null, 2),
    "",
    "User memory:",
    input.memorySummary?.length ? input.memorySummary.join("\n") : "none",
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeAdviceGenerator),
    schema: adviceDecisionSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeAdviceGenerator,
    promptVersion: aiPromptVersions.financeAdviceGenerator,
    coerce: coerceDecisionSet,
  })

  return {
    decision: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}

function coerceAdviceRanking(raw: unknown): AdviceRanking | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const rankedAdvice = Array.isArray((raw as { rankedAdvice?: unknown }).rankedAdvice)
    ? (raw as { rankedAdvice: unknown[] }).rankedAdvice
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null
          }

          const row = entry as Record<string, unknown>
          if (typeof row.adviceItemId !== "string") {
            return null
          }

          const position =
            row.position === 1 || row.position === 2 || row.position === 3
              ? row.position
              : null
          const score =
            typeof row.score === "number" && row.score >= 0 && row.score <= 1
              ? row.score
              : null

          if (!position || score === null) {
            return null
          }

          return {
            adviceItemId: row.adviceItemId,
            position,
            score,
            reason:
              typeof row.reason === "string" && row.reason.trim().length > 0
                ? row.reason.trim()
                : null,
          }
        })
        .filter((entry) => entry !== null)
    : null

  const parsed = adviceRankingSchema.safeParse({
    rankedAdvice: rankedAdvice ?? [],
  })

  return parsed.success ? parsed.data : null
}

export async function rankAdviceForHomeWithAi(input: {
  promptContext: Record<string, unknown>
}) {
  const gateway = getGatewayProvider()
  const prompt = [
    "You are ranking existing financial advice items for a personal finance home screen.",
    "Choose up to 3 active advice items that are most useful to show on Home right now.",
    "Prioritize urgency, actionability, breadth of impact, and non-duplication.",
    "Do not rewrite the advice. Only rank existing advice item ids.",
    "It is acceptable to return zero ranked items.",
    "Use only advice ids provided in the input.",
    "",
    "Structured context:",
    JSON.stringify(input.promptContext, null, 2),
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeAdviceGenerator),
    schema: adviceRankingSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeAdviceGenerator,
    promptVersion: `${aiPromptVersions.financeAdviceGenerator}-ranking`,
    coerce: coerceAdviceRanking,
  })

  return {
    ranking: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}
