"use client"

import type {
  PwaMutationEnvelope,
  PwaMutationKind,
  PwaMutationResult,
  PwaMutationStatus,
  StoredPwaMutation,
} from "./contracts"
import { createQueuedMutation } from "./mutation-definitions"
import {
  clearAllPwaState,
  getCurrentUserMeta,
  listStoredMutationsForUser,
  putStoredMutation,
  setLastSyncAt,
  updateStoredMutation,
} from "./store"

export const PWA_STATE_EVENT = "irene-pwa-state-changed"

let replayPromise: Promise<void> | null = null

function broadcastPwaStateChange() {
  window.dispatchEvent(new CustomEvent(PWA_STATE_EVENT))
}

function getRetryDelayMs(attemptCount: number) {
  return Math.min(30_000, 1_500 * 2 ** Math.max(0, attemptCount - 1))
}

async function sendMutationToServer(mutation: PwaMutationEnvelope) {
  const response = await fetch("/api/pwa/mutations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(mutation),
  })

  const result = (await response.json()) as PwaMutationResult
  return result
}

async function requestBackgroundReplay() {
  if (!("serviceWorker" in navigator)) {
    return
  }

  try {
    const registration = await navigator.serviceWorker.ready
    if ("sync" in registration) {
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> }
        }
      ).sync.register("irene-pwa-replay")
    }
  } catch {
    // Ignore background sync failures and rely on foreground replay hooks.
  }
}

export async function enqueuePwaMutation(mutation: PwaMutationEnvelope) {
  const stored: StoredPwaMutation = {
    ...mutation,
    status: "pending",
    attemptCount: 0,
    nextRetryAt: null,
    lastAttemptAt: null,
    redirectTo: null,
    invalidateRouteKeys: [],
    errorCode: null,
    errorMessage: null,
  }

  await putStoredMutation(stored)
  await requestBackgroundReplay()
  broadcastPwaStateChange()
}

export async function submitPwaMutation(mutation: PwaMutationEnvelope) {
  if (!navigator.onLine) {
    await enqueuePwaMutation(mutation)
    return {
      queued: true,
      result: null,
    }
  }

  try {
    const result = await sendMutationToServer(mutation)
    await setLastSyncAt(new Date().toISOString())
    broadcastPwaStateChange()

    if (result.status === "failed_retryable") {
      await enqueuePwaMutation(mutation)
      return {
        queued: true,
        result,
      }
    }

    return {
      queued: false,
      result,
    }
  } catch {
    await enqueuePwaMutation(mutation)
    return {
      queued: true,
      result: null,
    }
  }
}

export async function submitJsonPwaMutation(input: {
  userId: string
  kind: PwaMutationKind
  routePath: string
  json?: Record<string, unknown>
  routeParams?: Record<string, string>
}) {
  const mutation = createQueuedMutation({
    userId: input.userId,
    kind: input.kind,
    clientRef: input.kind.endsWith(".create") ? crypto.randomUUID() : null,
    payload: {
      routePath: input.routePath,
      bodyType: "json",
      json: input.json ?? {},
      routeParams: input.routeParams,
    },
  })

  return submitPwaMutation(mutation)
}

async function setMutationStatus(
  mutationId: string,
  status: PwaMutationStatus,
  patch: Partial<StoredPwaMutation> = {}
) {
  await updateStoredMutation(mutationId, {
    status,
    ...patch,
  })
}

export async function replayPendingPwaMutations(userId: string) {
  if (!navigator.onLine) {
    return
  }

  if (replayPromise) {
    return replayPromise
  }

  replayPromise = (async () => {
    const now = Date.now()
    const queued = await listStoredMutationsForUser(userId)
    const replayable = queued.filter((mutation) => {
      if (mutation.status === "pending") {
        return true
      }

      if (mutation.status !== "failed_retryable") {
        return false
      }

      if (!mutation.nextRetryAt) {
        return true
      }

      return new Date(mutation.nextRetryAt).getTime() <= now
    })

    for (const mutation of replayable) {
      await setMutationStatus(mutation.mutationId, "replaying", {
        lastAttemptAt: new Date().toISOString(),
      })
      broadcastPwaStateChange()

      try {
        const result = await sendMutationToServer(mutation)

        if (result.status === "succeeded") {
          await setMutationStatus(mutation.mutationId, "succeeded", {
            redirectTo: result.redirectTo ?? null,
            invalidateRouteKeys: result.invalidateRouteKeys,
            errorCode: null,
            errorMessage: null,
          })
          await setLastSyncAt(new Date().toISOString())
        } else if (result.status === "blocked_auth") {
          await setMutationStatus(mutation.mutationId, "blocked_auth", {
            errorCode: result.errorCode ?? null,
            errorMessage: result.message ?? null,
          })
        } else if (result.status === "failed_terminal") {
          await setMutationStatus(mutation.mutationId, "failed_terminal", {
            errorCode: result.errorCode ?? null,
            errorMessage: result.message ?? null,
          })
        } else {
          const attemptCount = mutation.attemptCount + 1
          await setMutationStatus(mutation.mutationId, "failed_retryable", {
            attemptCount,
            nextRetryAt: new Date(
              now + getRetryDelayMs(attemptCount)
            ).toISOString(),
            errorCode: result.errorCode ?? null,
            errorMessage: result.message ?? null,
          })
        }
      } catch {
        const attemptCount = mutation.attemptCount + 1
        await setMutationStatus(mutation.mutationId, "failed_retryable", {
          attemptCount,
          nextRetryAt: new Date(
            now + getRetryDelayMs(attemptCount)
          ).toISOString(),
          errorCode: "network_error",
          errorMessage: "Network unavailable during replay.",
        })
      }
    }

    broadcastPwaStateChange()
  })()

  try {
    await replayPromise
  } finally {
    replayPromise = null
  }
}

export async function clearPwaClientState() {
  await clearAllPwaState()

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null)
    registration?.active?.postMessage({
      type: "IR_PWA_CLEAR_CACHES",
    })
  }

  broadcastPwaStateChange()
}

export async function clearPwaStateIfUserChanged(nextUserId: string) {
  const existing = await getCurrentUserMeta()
  if (existing && existing.userId !== nextUserId) {
    await clearPwaClientState()
  }
}
