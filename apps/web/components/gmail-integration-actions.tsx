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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={isPending}
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
                setMessage("Failed to enqueue Gmail sync.")
                return
              }

              const data = (await response.json()) as { jobRunId: string }
              setMessage(`Enqueued Gmail sync: ${data.jobRunId}`)
            })
          }}
        >
          {isPending ? "Enqueueing..." : "Sync now"}
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
                setMessage("Failed to disconnect Gmail.")
                return
              }

              window.location.reload()
            })
          }}
        >
          Disconnect
        </Button>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
