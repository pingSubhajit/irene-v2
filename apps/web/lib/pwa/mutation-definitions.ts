import type {
  PwaMutationEnvelope,
  PwaMutationKind,
  PwaRouteKey,
} from "./contracts"

type MutationPayload = {
  routePath: string
  bodyType: "form" | "json"
  fields?: Record<string, string | string[]>
  json?: Record<string, unknown>
  routeParams?: Record<string, string>
}

function appendSerializedField(
  fields: Record<string, string | string[]>,
  key: string,
  value: FormDataEntryValue
) {
  const nextValue = typeof value === "string" ? value : value.name
  const existing = fields[key]

  if (Array.isArray(existing)) {
    existing.push(nextValue)
    return
  }

  if (typeof existing === "string") {
    fields[key] = [existing, nextValue]
    return
  }

  fields[key] = nextValue
}

export function serializeFormData(formData: FormData) {
  const fields: Record<string, string | string[]> = {}

  for (const [key, value] of formData.entries()) {
    appendSerializedField(fields, key, value)
  }

  return fields
}

function readStringField(
  fields: Record<string, string | string[]>,
  key: string
) {
  const value = fields[key]
  return Array.isArray(value) ? value[0] : value
}

export function getInvalidateRouteKeysForKind(
  kind: PwaMutationKind
): PwaRouteKey[] {
  switch (kind) {
    case "advice.dismiss":
    case "advice.done":
    case "advice.restore":
    case "advice.refresh":
      return ["dashboard"]
    case "review.resolve":
      return ["dashboard", "review", "activity"]
    case "event.update":
    case "event.ignore":
    case "event.restore":
    case "merchant.update":
    case "merchant.merge":
    case "merchant.logo.update":
    case "recurring.update":
    case "income_stream.update":
      return ["dashboard", "activity"]
    case "goal.create":
    case "goal.update":
    case "goal.archive":
    case "goal.complete":
      return ["dashboard", "goals"]
    case "settings.reporting_currency.update":
    case "settings.time_zone.update":
    case "settings.account.create":
    case "settings.payment_instrument.update":
    case "settings.payment_instrument.link_backing":
    case "settings.balance_observation.create":
    case "settings.balance_anchor.set":
    case "settings.balance_anchor.from_observation":
    case "settings.balance_anchor.delete":
    case "settings.memory.create":
    case "settings.memory.replace":
    case "settings.memory.pin":
    case "settings.memory.unpin":
    case "settings.memory.expire":
    case "settings.memory.restore":
    case "gmail.sync":
    case "gmail.disconnect":
      return ["settings"]
  }
}

export function deriveMutationKindFromForm(
  routePath: string,
  fields: Record<string, string | string[]>
): PwaMutationKind | null {
  switch (routePath) {
    case "/api/advice": {
      const action = readStringField(fields, "action")
      if (action === "dismiss") return "advice.dismiss"
      if (action === "done") return "advice.done"
      if (action === "restore") return "advice.restore"
      if (action === "refresh") return "advice.refresh"
      return null
    }
    case "/api/review/resolve":
      return "review.resolve"
    case "/api/activity/event": {
      const mode = readStringField(fields, "mode")
      if (mode === "ignore") return "event.ignore"
      if (mode === "restore") return "event.restore"
      return "event.update"
    }
    case "/api/activity/merchant":
      return readStringField(fields, "mergeIntoMerchantId")
        ? "merchant.merge"
        : "merchant.update"
    case "/api/activity/recurring":
      return readStringField(fields, "modelType") === "income_stream"
        ? "income_stream.update"
        : "recurring.update"
    case "/api/goals": {
      const action = readStringField(fields, "action")
      if (action === "create") return "goal.create"
      if (action === "archive") return "goal.archive"
      if (action === "complete") return "goal.complete"
      return "goal.update"
    }
    case "/api/settings/reporting-currency":
      return "settings.reporting_currency.update"
    case "/api/settings/time-zone":
      return "settings.time_zone.update"
    case "/api/settings/accounts/create":
      return "settings.account.create"
    case "/api/settings/payment-instrument/update":
      return "settings.payment_instrument.update"
    case "/api/settings/payment-instrument/link-backing":
      return "settings.payment_instrument.link_backing"
    case "/api/settings/balance-observation":
      return "settings.balance_observation.create"
    case "/api/settings/balance-anchor":
      return "settings.balance_anchor.set"
    case "/api/settings/balance-anchor/from-observation":
      return "settings.balance_anchor.from_observation"
    case "/api/settings/balance-anchor/delete":
      return "settings.balance_anchor.delete"
    case "/api/settings/memory": {
      const action = readStringField(fields, "action")
      if (action === "pin") return "settings.memory.pin"
      if (action === "unpin") return "settings.memory.unpin"
      if (action === "expire") return "settings.memory.expire"
      if (action === "restore") return "settings.memory.restore"
      return null
    }
    default:
      return null
  }
}

export function buildQueuedFormMutation(input: {
  userId: string
  routePath: string
  formData: FormData
}) {
  const fields = serializeFormData(input.formData)
  const kind = deriveMutationKindFromForm(input.routePath, fields)

  if (!kind) {
    return null
  }

  return createQueuedMutation({
    userId: input.userId,
    kind,
    payload: {
      routePath: input.routePath,
      bodyType: "form",
      fields,
    },
    clientRef: kind.endsWith(".create") ? crypto.randomUUID() : null,
  })
}

export function createQueuedMutation(input: {
  userId: string
  kind: PwaMutationKind
  payload: MutationPayload
  clientRef?: string | null
}) {
  const mutationId = crypto.randomUUID()

  return {
    mutationId,
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    idempotencyKey: mutationId,
    clientRef: input.clientRef ?? null,
  } satisfies PwaMutationEnvelope
}
