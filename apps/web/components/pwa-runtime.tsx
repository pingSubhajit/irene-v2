"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { buildQueuedFormMutation } from "@/lib/pwa/mutation-definitions"
import {
  clearPwaStateIfUserChanged,
  replayPendingPwaMutations,
  submitPwaMutation,
} from "@/lib/pwa/client-mutations"
import type { PwaUserMeta } from "@/lib/pwa/contracts"
import { setCurrentUserMeta } from "@/lib/pwa/store"

type PwaRuntimeProps = {
  user: PwaUserMeta
}

export function PwaRuntime({ user }: PwaRuntimeProps) {
  const router = useRouter()

  useEffect(() => {
    void clearPwaStateIfUserChanged(user.userId)
    void setCurrentUserMeta(user)
  }, [user])

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js")
    }
  }, [])

  useEffect(() => {
    const onOnline = () => {
      void replayPendingPwaMutations(user.userId)
    }

    const onFocus = () => {
      void replayPendingPwaMutations(user.userId)
    }

    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "IR_PWA_REPLAY_REQUESTED") {
        void replayPendingPwaMutations(user.userId)
      }
    }

    window.addEventListener("online", onOnline)
    window.addEventListener("focus", onFocus)
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage)

    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("focus", onFocus)
      navigator.serviceWorker?.removeEventListener(
        "message",
        onServiceWorkerMessage
      )
    }
  }, [user.userId])

  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) {
        return
      }

      const actionUrl = new URL(form.action, window.location.origin)
      if (actionUrl.origin !== window.location.origin) {
        return
      }

      const mutation = buildQueuedFormMutation({
        userId: user.userId,
        routePath: actionUrl.pathname,
        formData: new FormData(form),
      })

      if (!mutation) {
        return
      }

      event.preventDefault()

      void submitPwaMutation(mutation).then(({ queued, result }) => {
        if (!queued && result?.ok) {
          if (result.redirectTo) {
            router.push(result.redirectTo)
          } else {
            router.refresh()
          }
          return
        }

        if (queued) {
          router.refresh()
        }
      })
    }

    document.addEventListener("submit", onSubmit, true)
    return () => {
      document.removeEventListener("submit", onSubmit, true)
    }
  }, [router, user.userId])

  return null
}
