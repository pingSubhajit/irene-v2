import { z } from "zod"

import { getFxEnv } from "@workspace/config/server"

const historicalRateResponseSchema = z.object({
  data: z.record(
    z.string(),
    z.object({
      code: z.string().min(3),
      value: z.number().positive(),
    }),
  ),
})

export async function fetchCurrencyApiHistoricalRate(input: {
  baseCurrency: string
  quoteCurrency: string
  date: string
}) {
  const env = getFxEnv()

  if (!env.CURRENCYAPI_API_KEY) {
    throw new Error("CURRENCYAPI_API_KEY is not configured")
  }

  const url = new URL("historical", `${env.CURRENCYAPI_BASE_URL}/`)
  url.searchParams.set("apikey", env.CURRENCYAPI_API_KEY)
  url.searchParams.set("base_currency", input.baseCurrency)
  url.searchParams.set("currencies", input.quoteCurrency)
  url.searchParams.set("date", input.date)

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  })

  if (response.status === 404 || response.status === 422) {
    return null
  }

  if (!response.ok) {
    throw new Error(`currencyapi historical rate lookup failed with ${response.status}`)
  }

  const parsed = historicalRateResponseSchema.parse(await response.json())
  const record = parsed.data[input.quoteCurrency]

  if (!record) {
    return null
  }

  return {
    provider: "currencyapi" as const,
    baseCurrency: input.baseCurrency,
    quoteCurrency: input.quoteCurrency,
    rateDate: input.date,
    rate: record.value,
  }
}
