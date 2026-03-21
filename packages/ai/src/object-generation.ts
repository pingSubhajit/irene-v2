import { NoObjectGeneratedError, generateObject } from "ai"
import type { z } from "zod"

export type GeneratedObjectMetadata = {
  provider: string
  modelName: string
  promptVersion: string
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  requestId: string | null
}

export type ObjectRecoveryMetadata =
  | {
      mode: "strict"
    }
  | {
      mode: "coerced"
      errorMessage: string
      finishReason: string | null
      rawResponseExcerpt: string
    }
  | {
      mode: "fallback"
      errorMessage: string
      finishReason: string | null
      rawResponseExcerpt: string
    }

function getUsage(result: unknown) {
  const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage

  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
  }
}

function getRequestId(result: unknown) {
  const response = (result as { response?: { id?: string } }).response
  return response?.id ?? null
}

function getUsageFromNoObjectError(error: NoObjectGeneratedError) {
  return {
    inputTokens: error.usage?.inputTokens ?? null,
    outputTokens: error.usage?.outputTokens ?? null,
  }
}

function getRequestIdFromNoObjectError(error: NoObjectGeneratedError) {
  return error.response?.id ?? null
}

export function parseLooseJson(text: string) {
  const candidates = [text.trim()]
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1).trim())
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      continue
    }
  }

  return null
}

export async function generateStructuredObject<T>({
  model,
  schema,
  prompt,
  provider,
  modelName,
  promptVersion,
  coerce,
  fallback,
}: {
  model: ReturnType<typeof generateObject> extends never ? never : unknown
  schema: z.ZodType<T>
  prompt: string
  provider: string
  modelName: string
  promptVersion: string
  coerce?: (raw: unknown) => T | null
  fallback?: () => T
}) {
  const startedAt = Date.now()

  try {
    const result = await generateObject({
      model: model as never,
      schema,
      prompt,
    })

    return {
      object: result.object as T,
      metadata: {
        provider,
        modelName,
        promptVersion,
        latencyMs: Date.now() - startedAt,
        requestId: getRequestId(result),
        ...getUsage(result),
      } satisfies GeneratedObjectMetadata,
      recovery: {
        mode: "strict",
      } satisfies ObjectRecoveryMetadata,
    }
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
      const metadata = {
        provider,
        modelName,
        promptVersion,
        latencyMs: Date.now() - startedAt,
        requestId: getRequestIdFromNoObjectError(error),
        ...getUsageFromNoObjectError(error),
      } satisfies GeneratedObjectMetadata

      const parsed = parseLooseJson(error.text)

      if (parsed && coerce) {
        const coerced = coerce(parsed)
        if (coerced) {
          return {
            object: coerced,
            metadata,
            recovery: {
              mode: "coerced",
              errorMessage: error.message,
              finishReason: error.finishReason ?? null,
              rawResponseExcerpt: error.text.slice(0, 1200),
            } satisfies ObjectRecoveryMetadata,
          }
        }
      }

      if (fallback) {
        return {
          object: fallback(),
          metadata,
          recovery: {
            mode: "fallback",
            errorMessage: error.message,
            finishReason: error.finishReason ?? null,
            rawResponseExcerpt: error.text.slice(0, 1200),
          } satisfies ObjectRecoveryMetadata,
        }
      }
    }

    throw error
  }
}
