"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"

const CONFIRMATION_PHRASE = "RESET INGESTION"

type ResetResponse = {
  deletedRawDocuments: number
  deletedAttachments: number
  deletedStorageObjects: number
  backfillJobRunId: string
}

export function ResetIngestionButton() {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const disabled = isPending || confirmation !== CONFIRMATION_PHRASE

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-zinc-600">
        This permanently deletes currently ingested Gmail raw documents, attachment
        records, and stored blobs for your connected inbox, then immediately starts a
        fresh 90-day backfill.
      </p>
      <label className="grid gap-2 text-sm font-medium text-zinc-950">
        Type <span className="font-mono">{CONFIRMATION_PHRASE}</span> to confirm
        <input
          className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-400"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={CONFIRMATION_PHRASE}
        />
      </label>
      <div className="flex flex-col gap-3">
        <Button
          disabled={disabled}
          variant="destructive"
          onClick={() => {
            setMessage(null)
            startTransition(async () => {
              const response = await fetch("/api/debug/ingestion/reset", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  confirmation,
                }),
              })

              if (!response.ok) {
                setMessage("Failed to reset Gmail ingestion data.")
                return
              }

              const data = (await response.json()) as ResetResponse
              setMessage(
                `Deleted ${data.deletedRawDocuments} documents, ${data.deletedAttachments} attachments, and ${data.deletedStorageObjects} stored objects. Re-enqueued backfill: ${data.backfillJobRunId}`,
              )
              setConfirmation("")
              router.refresh()
            })
          }}
        >
          {isPending ? "Resetting..." : "Reset Gmail ingestion data"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  )
}
