"use client"

import { useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

export function RunSmokeTestButton() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={isPending}
        variant="outline"
        onClick={() => {
          setMessage(null)
          startTransition(async () => {
            const response = await fetch("/api/ops/system-healthcheck", {
              method: "POST",
            })

            if (!response.ok) {
              setMessage("Failed to enqueue worker smoke test.")
              return
            }

            const data = (await response.json()) as { jobRunId: string }
            setMessage(`Enqueued worker smoke test: ${data.jobRunId}`)
          })
        }}
      >
        {isPending ? "Enqueueing..." : "Run worker smoke test"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  )
}
