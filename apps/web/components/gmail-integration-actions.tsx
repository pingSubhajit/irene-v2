"use client"

import { useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

type GmailIntegrationActionsProps = {
  connected: boolean
}

export function GmailIntegrationActions({
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
              const response = await fetch("/api/integrations/email/google/sync", {
                method: "POST",
              })

              if (!response.ok) {
                setMessage("Could not queue a sync. Try again in a moment.")
                return
              }

              await response.json()
              setMessage("Sync queued. Irene will refresh the inbox picture shortly.")
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
              const response = await fetch(
                "/api/integrations/email/google/disconnect",
                {
                  method: "POST",
                },
              )

              if (!response.ok) {
                setMessage("Could not disconnect Gmail right now.")
                return
              }

              window.location.reload()
            })
          }}
        >
          Disconnect
        </Button>
      </div>
      {message ? <p className="text-sm leading-6 text-white/56">{message}</p> : null}
    </div>
  )
}
