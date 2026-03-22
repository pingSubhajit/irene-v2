import { createGateway } from "@ai-sdk/gateway"
import { z } from "zod"

import { getAiEnv } from "@workspace/config/server"

import { aiModels, aiPromptVersions } from "./config"
import { generateStructuredObject } from "./object-generation"

const providerName = "ai-gateway"

export const advicePhraseSchema = z.object({
  title: z.string().min(6).max(120),
  summary: z.string().min(12).max(240),
  detail: z.string().min(18).max(520),
  nextStep: z.string().max(180).nullable().optional(),
})

export type AdvicePhrase = z.infer<typeof advicePhraseSchema>

function getGatewayProvider() {
  const env = getAiEnv()

  return createGateway({
    apiKey: env.AI_GATEWAY_API_KEY,
  })
}

export async function phraseAdviceWithAi(input: {
  triggerType: string
  payload: Record<string, unknown>
  memorySummary?: string[]
}) {
  const gateway = getGatewayProvider()
  const prompt = [
    "You are writing grounded financial advice copy for a personal finance app.",
    "Only use facts present in the trigger payload.",
    "Do not invent balances, merchants, bills, goals, dates, reasons, or confidence.",
    "Respect the currency and formatted amount labels provided in the payload.",
    "If both minor-unit numbers and formatted labels are present, prefer the formatted labels in user-facing copy.",
    "Never substitute a different currency symbol or assume USD by default.",
    "Keep the tone calm, specific, and operational.",
    "If the evidence is uncertain, say so plainly without dramatizing it.",
    "title should be short. summary should be one compact sentence. detail can be 1-3 short sentences.",
    "nextStep should be a plain action hint when there is an obvious next move, otherwise null.",
    "",
    `Trigger type: ${input.triggerType}`,
    "Trigger payload:",
    JSON.stringify(input.payload, null, 2),
    "",
    "User memory:",
    input.memorySummary?.length ? input.memorySummary.join("\n") : "none",
  ].join("\n")

  const result = await generateStructuredObject({
    model: gateway(aiModels.financeAdviceGenerator),
    schema: advicePhraseSchema,
    prompt,
    provider: providerName,
    modelName: aiModels.financeAdviceGenerator,
    promptVersion: aiPromptVersions.financeAdviceGenerator,
  })

  return {
    phrase: result.object,
    metadata: result.metadata,
    recovery: result.recovery,
  }
}
