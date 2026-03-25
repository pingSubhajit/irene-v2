import { POST as advicePost } from "@/app/api/advice/route"
import { POST as activityEventPost } from "@/app/api/activity/event/route"
import { POST as activityMerchantPost } from "@/app/api/activity/merchant/route"
import { POST as activityRecurringPost } from "@/app/api/activity/recurring/route"
import { POST as goalsPost } from "@/app/api/goals/route"
import { POST as gmailDisconnectPost } from "@/app/api/integrations/email/google/disconnect/route"
import { POST as gmailSyncPost } from "@/app/api/integrations/email/google/sync/route"
import { POST as merchantLogoPost } from "@/app/api/merchants/[merchantId]/logo/route"
import { POST as reviewResolvePost } from "@/app/api/review/resolve/route"
import { POST as accountCreatePost } from "@/app/api/settings/accounts/create/route"
import { POST as balanceAnchorDeletePost } from "@/app/api/settings/balance-anchor/delete/route"
import { POST as balanceAnchorFromObservationPost } from "@/app/api/settings/balance-anchor/from-observation/route"
import { POST as balanceAnchorPost } from "@/app/api/settings/balance-anchor/route"
import { POST as balanceObservationPost } from "@/app/api/settings/balance-observation/route"
import { POST as memoryPost } from "@/app/api/settings/memory/route"
import { POST as paymentInstrumentLinkBackingPost } from "@/app/api/settings/payment-instrument/link-backing/route"
import { POST as paymentInstrumentUpdatePost } from "@/app/api/settings/payment-instrument/update/route"
import { POST as reportingCurrencyPost } from "@/app/api/settings/reporting-currency/route"
import { POST as timeZonePost } from "@/app/api/settings/time-zone/route"
import type {
  PwaMutationEnvelope,
  PwaMutationKind,
  PwaMutationResult,
} from "./contracts"
import { getInvalidateRouteKeysForKind } from "./mutation-definitions"

type DispatchPayload = {
  routePath?: string
  bodyType?: "form" | "json"
  fields?: Record<string, string | string[]>
  json?: Record<string, unknown>
  routeParams?: Record<string, string>
}

function appendField(
  formData: FormData,
  key: string,
  value: string | string[]
) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      formData.append(key, entry)
    }
    return
  }

  formData.append(key, value)
}

function buildFormRequest(
  request: Request,
  routePath: string,
  fields: Record<string, string | string[]>
) {
  const formData = new FormData()

  for (const [key, value] of Object.entries(fields)) {
    appendField(formData, key, value)
  }

  return new Request(new URL(routePath, request.url), {
    method: "POST",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
    body: formData,
  })
}

function buildJsonRequest(
  request: Request,
  routePath: string,
  json: Record<string, unknown>
) {
  return new Request(new URL(routePath, request.url), {
    method: "POST",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify(json),
  })
}

function toAppLocation(location: string | null) {
  if (!location) {
    return null
  }

  const url = new URL(location, "http://localhost")
  return `${url.pathname}${url.search}`
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return null
  }

  return (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
}

function normalizeResult(input: {
  mutation: PwaMutationEnvelope
  response: Response
  responseJson: Record<string, unknown> | null
}) {
  const { mutation, response, responseJson } = input
  const redirectTo =
    toAppLocation(response.headers.get("location")) ??
    (typeof responseJson?.redirectTo === "string"
      ? responseJson.redirectTo
      : null)

  let status: PwaMutationResult["status"]
  if (
    (response.ok || [301, 302, 303].includes(response.status)) &&
    !redirectLooksTerminal(redirectTo)
  ) {
    status = "succeeded"
  } else if (response.status === 401 || response.status === 403) {
    status = "blocked_auth"
  } else if (response.status >= 500) {
    status = "failed_retryable"
  } else {
    status = "failed_terminal"
  }

  return {
    ok: status === "succeeded",
    mutationId: mutation.mutationId,
    kind: mutation.kind,
    status,
    redirectTo,
    invalidateRouteKeys: getInvalidateRouteKeysForKind(mutation.kind),
    serverEntityRefs: inferServerEntityRefs(mutation.kind, redirectTo),
    errorCode: status === "succeeded" ? null : `http_${response.status}`,
    message:
      typeof responseJson?.error === "string"
        ? responseJson.error
        : typeof responseJson?.message === "string"
          ? responseJson.message
          : null,
  } satisfies PwaMutationResult
}

function redirectLooksTerminal(redirectTo: string | null) {
  if (!redirectTo) {
    return false
  }

  const url = new URL(redirectTo, "http://localhost")
  const values = Array.from(url.searchParams.values())

  return values.some((value) =>
    /(invalid|missing|failed|error|disabled|mismatch|denied)/i.test(value)
  )
}

function inferServerEntityRefs(
  kind: PwaMutationKind,
  redirectTo: string | null
) {
  if (!redirectTo) {
    return null
  }

  if (kind.startsWith("goal.")) {
    const goalMatch = redirectTo.match(/^\/goals\/([^?]+)/)
    if (goalMatch) {
      return { goalId: goalMatch[1] ?? null } as Record<string, string | null>
    }
  }

  if (kind.startsWith("settings.memory.")) {
    const memoryMatch = redirectTo.match(/^\/settings\/memory\/([^?]+)/)
    if (memoryMatch) {
      return { memoryFactId: memoryMatch[1] ?? null } as Record<
        string,
        string | null
      >
    }
  }

  return null
}

async function dispatchMutationRequest(
  request: Request,
  mutation: PwaMutationEnvelope
) {
  const payload = mutation.payload as DispatchPayload

  switch (mutation.kind) {
    case "advice.dismiss":
    case "advice.done":
    case "advice.restore":
    case "advice.refresh":
      return advicePost(
        buildFormRequest(request, "/api/advice", payload.fields ?? {})
      )
    case "review.resolve":
      return reviewResolvePost(
        buildFormRequest(request, "/api/review/resolve", payload.fields ?? {})
      )
    case "event.update":
    case "event.ignore":
    case "event.restore":
      return activityEventPost(
        buildFormRequest(request, "/api/activity/event", payload.fields ?? {})
      )
    case "merchant.update":
    case "merchant.merge":
      return activityMerchantPost(
        buildFormRequest(
          request,
          "/api/activity/merchant",
          payload.fields ?? {}
        )
      )
    case "merchant.logo.update":
      return merchantLogoPost(
        buildJsonRequest(
          request,
          payload.routePath ?? "/api/merchants/unknown/logo",
          payload.json ?? {}
        ),
        {
          params: Promise.resolve({
            merchantId: payload.routeParams?.merchantId ?? "",
          }),
        }
      )
    case "recurring.update":
    case "income_stream.update":
      return activityRecurringPost(
        buildFormRequest(
          request,
          "/api/activity/recurring",
          payload.fields ?? {}
        )
      )
    case "goal.create":
    case "goal.update":
    case "goal.archive":
    case "goal.complete":
      return goalsPost(
        buildFormRequest(request, "/api/goals", payload.fields ?? {})
      )
    case "settings.reporting_currency.update":
      return reportingCurrencyPost(
        buildFormRequest(
          request,
          "/api/settings/reporting-currency",
          payload.fields ?? {}
        )
      )
    case "settings.time_zone.update":
      return timeZonePost(
        buildFormRequest(
          request,
          "/api/settings/time-zone",
          payload.fields ?? {}
        )
      )
    case "settings.account.create":
      return accountCreatePost(
        buildFormRequest(
          request,
          "/api/settings/accounts/create",
          payload.fields ?? {}
        )
      )
    case "settings.payment_instrument.update":
      return paymentInstrumentUpdatePost(
        buildFormRequest(
          request,
          "/api/settings/payment-instrument/update",
          payload.fields ?? {}
        )
      )
    case "settings.payment_instrument.link_backing":
      return paymentInstrumentLinkBackingPost(
        buildFormRequest(
          request,
          "/api/settings/payment-instrument/link-backing",
          payload.fields ?? {}
        )
      )
    case "settings.balance_observation.create":
      return balanceObservationPost(
        buildFormRequest(
          request,
          "/api/settings/balance-observation",
          payload.fields ?? {}
        )
      )
    case "settings.balance_anchor.set":
      return balanceAnchorPost(
        buildFormRequest(
          request,
          "/api/settings/balance-anchor",
          payload.fields ?? {}
        )
      )
    case "settings.balance_anchor.from_observation":
      return balanceAnchorFromObservationPost(
        buildFormRequest(
          request,
          "/api/settings/balance-anchor/from-observation",
          payload.fields ?? {}
        )
      )
    case "settings.balance_anchor.delete":
      return balanceAnchorDeletePost(
        buildFormRequest(
          request,
          "/api/settings/balance-anchor/delete",
          payload.fields ?? {}
        )
      )
    case "settings.memory.create":
    case "settings.memory.replace":
      return memoryPost(
        buildJsonRequest(request, "/api/settings/memory", payload.json ?? {})
      )
    case "settings.memory.pin":
    case "settings.memory.unpin":
    case "settings.memory.expire":
    case "settings.memory.restore":
      return memoryPost(
        buildFormRequest(request, "/api/settings/memory", payload.fields ?? {})
      )
    case "gmail.sync":
      return gmailSyncPost()
    case "gmail.disconnect":
      return gmailDisconnectPost()
  }
}

export async function executePwaMutation(
  request: Request,
  mutation: PwaMutationEnvelope
) {
  const response = await dispatchMutationRequest(request, mutation)
  const responseJson = await readJsonResponse(response)

  return normalizeResult({
    mutation,
    response,
    responseJson,
  })
}
