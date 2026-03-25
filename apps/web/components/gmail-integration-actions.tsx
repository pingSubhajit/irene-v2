"use client"

import { useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"
import { submitJsonPwaMutation } from "@/lib/pwa/client-mutations"

type GmailIntegrationActionsProps = {
  userId: string
  connected: boolean
}

export function GmailIntegrationActions({
  userId,
  connected,
}: GmailIntegrationActionsProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          disabled={isPending}
          variant="secondary"
          onClick={() => {
            window.location.href = "/api/integrations/email/google/connect"
          }}
        >
          {connected ? "Reconnect Gmail" : "Connect Gmail"}
        </Button>
        <Button
          disabled={!connected || isPending}
          variant="outline"
          onClick={() => {
            setMessage(null)
            startTransition(async () => {
              const { queued, result } = await submitJsonPwaMutation({
                userId,
                kind: "gmail.sync",
                routePath: "/api/integrations/email/google/sync",
              })

              if (!queued && !result?.ok) {
                setMessage(
                  result?.message ??
                    "Could not queue a sync. Try again in a moment."
                )
                return
              }

              setMessage(
                "Sync queued. Irene will refresh the inbox picture shortly."
              )
            })
          }}
        >
          {isPending ? "Queueing..." : "Sync now"}
        </Button>
        <Button
          disabled={!connected || isPending}
          variant="destructive"
          onClick={() => {
            setMessage(null)
            startTransition(async () => {
              const { queued, result } = await submitJsonPwaMutation({
                userId,
                kind: "gmail.disconnect",
                routePath: "/api/integrations/email/google/disconnect",
              })

              if (!queued && !result?.ok) {
                setMessage(
                  result?.message ?? "Could not disconnect Gmail right now."
                )
                return
              }

              window.location.reload()
            })
          }}
        >
          Disconnect
        </Button>
      </div>
      {message ? (
        <p className="text-sm leading-6 text-white/56">{message}</p>
      ) : null}
    </div>
  )
}
