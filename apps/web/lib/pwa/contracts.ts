export const PWA_ROUTE_KEYS = [
  "dashboard",
  "activity",
  "review",
  "goals",
  "settings",
] as const

export type PwaRouteKey = (typeof PWA_ROUTE_KEYS)[number]

export const PWA_MUTATION_KINDS = [
  "advice.dismiss",
  "advice.done",
  "advice.restore",
  "advice.refresh",
  "review.resolve",
  "event.update",
  "event.ignore",
  "event.restore",
  "merchant.update",
  "merchant.merge",
  "merchant.logo.update",
  "recurring.update",
  "income_stream.update",
  "goal.create",
  "goal.update",
  "goal.archive",
  "goal.complete",
  "settings.reporting_currency.update",
  "settings.time_zone.update",
  "settings.account.create",
  "settings.payment_instrument.update",
  "settings.payment_instrument.link_backing",
  "settings.balance_observation.create",
  "settings.balance_anchor.set",
  "settings.balance_anchor.from_observation",
  "settings.balance_anchor.delete",
  "settings.memory.create",
  "settings.memory.replace",
  "settings.memory.pin",
  "settings.memory.unpin",
  "settings.memory.expire",
  "settings.memory.restore",
  "gmail.sync",
  "gmail.disconnect",
] as const

export type PwaMutationKind = (typeof PWA_MUTATION_KINDS)[number]

export type PwaMutationStatus =
  | "pending"
  | "replaying"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "blocked_auth"

export type PwaUserMeta = {
  userId: string
  name: string
  email?: string | null
  image?: string | null
}

export type SnapshotTransactionItem = {
  id: string
  title: string
  subtitle: string
  amountLabel: string
  tone?: "positive" | "negative" | "neutral"
  pending?: boolean
}

export type DashboardSnapshotPayload = {
  user: PwaUserMeta
  reviewAttentionCount: number
  monthSpendLabel: string
  monthIncomeLabel: string
  netFlowLabel: string
  refundsLabel: string
  setupBlockerTitle?: string | null
  categories: Array<{
    label: string
    amountLabel: string
  }>
  recentTransactions: SnapshotTransactionItem[]
  advice: Array<{
    id: string
    title: string
    summary: string
    updatedAtLabel: string
    pending?: boolean
  }>
}

export type ActivitySnapshotPayload = {
  user: PwaUserMeta
  viewLabel: string
  filtersLabel: string
  items: SnapshotTransactionItem[]
}

export type ReviewSnapshotPayload = {
  user: PwaUserMeta
  items: Array<{
    id: string
    title: string
    subtitle: string
    itemType: string
    pending?: boolean
  }>
}

export type GoalsSnapshotPayload = {
  user: PwaUserMeta
  active: Array<{
    id: string
    name: string
    projectedLabel: string
    gapLabel: string
    targetDateLabel: string
    currency: string
    pending?: boolean
  }>
  closed: Array<{
    id: string
    name: string
    status: string
    targetDateLabel: string
  }>
}

export type SettingsSnapshotPayload = {
  user: PwaUserMeta
  memberSinceLabel: string
  inboxLabel: string
  reportingCurrency: string
  timeZone: string
  lastSyncLabel: string
  backfillState: string
  cashAccountsCount: number
  linkedInstrumentSummary: string
  memoryFactsCount: number
  gmailConnected: boolean
}

export type PwaSnapshotPayloadByRoute = {
  dashboard: DashboardSnapshotPayload
  activity: ActivitySnapshotPayload
  review: ReviewSnapshotPayload
  goals: GoalsSnapshotPayload
  settings: SettingsSnapshotPayload
}

export type PwaRouteSnapshot<K extends PwaRouteKey = PwaRouteKey> = {
  routeKey: K
  capturedAt: string
  staleAt: string
  userId: string
  version: number
  payload: PwaSnapshotPayloadByRoute[K]
}

export type AnyPwaRouteSnapshot = {
  [K in PwaRouteKey]: PwaRouteSnapshot<K>
}[PwaRouteKey]

export type PwaMutationEnvelope = {
  mutationId: string
  userId: string
  kind: PwaMutationKind
  payload: Record<string, unknown>
  createdAt: string
  idempotencyKey: string
  clientRef?: string | null
}

export type PwaMutationResult = {
  ok: boolean
  mutationId: string
  kind: PwaMutationKind
  status: Exclude<PwaMutationStatus, "pending" | "replaying">
  redirectTo?: string | null
  invalidateRouteKeys: PwaRouteKey[]
  serverEntityRefs?: Record<string, string | null> | null
  errorCode?: string | null
  message?: string | null
}

export type StoredPwaMutation = PwaMutationEnvelope & {
  status: PwaMutationStatus
  attemptCount: number
  nextRetryAt?: string | null
  lastAttemptAt?: string | null
  redirectTo?: string | null
  invalidateRouteKeys: PwaRouteKey[]
  errorCode?: string | null
  errorMessage?: string | null
}

export type PwaQueueSummary = {
  pendingCount: number
  replayingCount: number
  failedCount: number
  blockedCount: number
}

export const PWA_SNAPSHOT_VERSION = 1
export const PWA_DB_NAME = "irene-pwa"
export const PWA_DB_VERSION = 1
