export const REPORTING_CURRENCY_OPTIONS = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SGD",
] as const

export function isSupportedReportingCurrency(value: string): value is (typeof REPORTING_CURRENCY_OPTIONS)[number] {
  return REPORTING_CURRENCY_OPTIONS.includes(
    value as (typeof REPORTING_CURRENCY_OPTIONS)[number],
  )
}
