import type {
  ActivitySnapshotPayload,
  DashboardSnapshotPayload,
  GoalsSnapshotPayload,
  PwaRouteKey,
  PwaRouteSnapshot,
  ReviewSnapshotPayload,
  SettingsSnapshotPayload,
  StoredPwaMutation,
} from "./contracts"

function readField(mutation: StoredPwaMutation, key: string) {
  const fields = (
    mutation.payload as { fields?: Record<string, string | string[]> }
  ).fields
  const value = fields?.[key]
  return Array.isArray(value) ? value[0] : value
}

function activeOverlayMutations(mutations: StoredPwaMutation[]) {
  return mutations.filter(
    (mutation) =>
      mutation.status === "pending" ||
      mutation.status === "replaying" ||
      mutation.status === "blocked_auth"
  )
}

function overlayDashboard(
  payload: DashboardSnapshotPayload,
  mutations: StoredPwaMutation[]
) {
  const nextPayload: DashboardSnapshotPayload = {
    ...payload,
    advice: [...payload.advice],
    recentTransactions: [...payload.recentTransactions],
  }

  for (const mutation of activeOverlayMutations(mutations)) {
    if (mutation.kind === "review.resolve") {
      nextPayload.reviewAttentionCount = Math.max(
        0,
        nextPayload.reviewAttentionCount - 1
      )
    }

    if (mutation.kind === "advice.dismiss" || mutation.kind === "advice.done") {
      const adviceItemId = readField(mutation, "adviceItemId")
      nextPayload.advice = nextPayload.advice.filter(
        (item) => item.id !== adviceItemId
      )
    }

    if (
      mutation.kind === "event.ignore" ||
      mutation.kind === "event.restore" ||
      mutation.kind === "event.update"
    ) {
      const eventId = readField(mutation, "eventId")
      nextPayload.recentTransactions = nextPayload.recentTransactions.map(
        (item) => (item.id === eventId ? { ...item, pending: true } : item)
      )
    }
  }

  return nextPayload
}

function overlayActivity(
  payload: ActivitySnapshotPayload,
  mutations: StoredPwaMutation[]
) {
  const nextPayload: ActivitySnapshotPayload = {
    ...payload,
    items: [...payload.items],
  }

  for (const mutation of activeOverlayMutations(mutations)) {
    if (
      mutation.kind === "event.update" ||
      mutation.kind === "event.ignore" ||
      mutation.kind === "event.restore"
    ) {
      const eventId = readField(mutation, "eventId")
      nextPayload.items = nextPayload.items.map((item) =>
        item.id === eventId ? { ...item, pending: true } : item
      )
    }
  }

  return nextPayload
}

function overlayReview(
  payload: ReviewSnapshotPayload,
  mutations: StoredPwaMutation[]
) {
  let items = [...payload.items]

  for (const mutation of activeOverlayMutations(mutations)) {
    if (mutation.kind === "review.resolve") {
      const reviewItemId = readField(mutation, "reviewItemId")
      items = items.filter((item) => item.id !== reviewItemId)
    }
  }

  return {
    ...payload,
    items,
  }
}

function overlayGoals(
  payload: GoalsSnapshotPayload,
  mutations: StoredPwaMutation[]
) {
  let active = [...payload.active]
  let closed = [...payload.closed]

  for (const mutation of activeOverlayMutations(mutations)) {
    if (mutation.kind === "goal.create") {
      const name = readField(mutation, "name") ?? "Pending goal"
      const targetDate = readField(mutation, "targetDate") ?? "Pending target"
      const targetAmount = readField(mutation, "targetAmount") ?? "0"
      active = [
        {
          id: `pending:${mutation.clientRef ?? mutation.mutationId}`,
          name,
          projectedLabel: `${targetAmount} pending`,
          gapLabel: `${targetAmount} pending`,
          targetDateLabel: targetDate,
          currency: "INR",
          pending: true,
        },
        ...active,
      ]
    }

    if (
      mutation.kind === "goal.update" ||
      mutation.kind === "goal.archive" ||
      mutation.kind === "goal.complete"
    ) {
      const goalId = readField(mutation, "goalId")
      active = active.map((goal) =>
        goal.id === goalId ? { ...goal, pending: true } : goal
      )

      if (
        mutation.kind === "goal.archive" ||
        mutation.kind === "goal.complete"
      ) {
        const matched = active.find((goal) => goal.id === goalId)
        active = active.filter((goal) => goal.id !== goalId)
        if (matched) {
          closed = [
            {
              id: matched.id,
              name: matched.name,
              status:
                mutation.kind === "goal.complete" ? "completed" : "archived",
              targetDateLabel: matched.targetDateLabel,
            },
            ...closed,
          ]
        }
      }
    }
  }

  return {
    ...payload,
    active,
    closed,
  }
}

function overlaySettings(
  payload: SettingsSnapshotPayload,
  mutations: StoredPwaMutation[]
) {
  const nextPayload: SettingsSnapshotPayload = {
    ...payload,
  }

  for (const mutation of activeOverlayMutations(mutations)) {
    if (mutation.kind === "settings.reporting_currency.update") {
      const currency = readField(mutation, "currency")
      if (currency) {
        nextPayload.reportingCurrency = currency
      }
    }

    if (mutation.kind === "settings.time_zone.update") {
      const timeZone = readField(mutation, "timeZone")
      if (timeZone) {
        nextPayload.timeZone = timeZone
      }
    }

    if (mutation.kind === "settings.account.create") {
      nextPayload.cashAccountsCount += 1
    }

    if (mutation.kind === "settings.memory.create") {
      nextPayload.memoryFactsCount += 1
    }

    if (mutation.kind === "settings.memory.expire") {
      nextPayload.memoryFactsCount = Math.max(
        0,
        nextPayload.memoryFactsCount - 1
      )
    }

    if (mutation.kind === "settings.memory.restore") {
      nextPayload.memoryFactsCount += 1
    }

    if (mutation.kind === "gmail.sync") {
      nextPayload.lastSyncLabel = "sync queued"
    }

    if (mutation.kind === "gmail.disconnect") {
      nextPayload.gmailConnected = false
      nextPayload.inboxLabel = "not linked"
    }
  }

  return nextPayload
}

export function applyOptimisticSnapshotOverlays<K extends PwaRouteKey>(
  snapshot: PwaRouteSnapshot<K>,
  mutations: StoredPwaMutation[]
) {
  switch (snapshot.routeKey) {
    case "dashboard":
      return {
        ...snapshot,
        payload: overlayDashboard(
          snapshot.payload as DashboardSnapshotPayload,
          mutations
        ),
      }
    case "activity":
      return {
        ...snapshot,
        payload: overlayActivity(
          snapshot.payload as ActivitySnapshotPayload,
          mutations
        ),
      }
    case "review":
      return {
        ...snapshot,
        payload: overlayReview(
          snapshot.payload as ReviewSnapshotPayload,
          mutations
        ),
      }
    case "goals":
      return {
        ...snapshot,
        payload: overlayGoals(
          snapshot.payload as GoalsSnapshotPayload,
          mutations
        ),
      }
    case "settings":
      return {
        ...snapshot,
        payload: overlaySettings(
          snapshot.payload as SettingsSnapshotPayload,
          mutations
        ),
      }
  }
}
