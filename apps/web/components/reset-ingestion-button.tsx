"use client"

import { useState, useTransition, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

const CONFIRMATION_PHRASE = "RESET INGESTION"

type ResetResponse = {
  deletedRawDocuments: number
  deletedAttachments: number
  deletedStorageObjects: number
  deletedFinancialEvents: number
  deletedRecurringObligations: number
  deletedIncomeStreams: number
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
      <p className="text-sm leading-6 text-white/56">
        This permanently clears the currently ingested Gmail dataset for your account,
        including raw documents, attachments, extracted finance state, ledger events,
        and recurring models, then immediately starts a fresh 90-day backfill.
      </p>
      <label className="grid gap-2 text-sm font-medium text-white">
        <span>
          Type <span className="font-mono text-[var(--neo-yellow)]">{CONFIRMATION_PHRASE}</span> to confirm
        </span>
        <Input
          value={confirmation}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setConfirmation(event.target.value)
          }
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
                setMessage("Could not reset the inbox data.")
                return
              }

              const data = (await response.json()) as ResetResponse
              setMessage(
                `Deleted ${data.deletedRawDocuments} documents, ${data.deletedAttachments} attachments, ${data.deletedFinancialEvents} ledger events, ${data.deletedRecurringObligations} recurring obligations, ${data.deletedIncomeStreams} income streams, and ${data.deletedStorageObjects} stored objects. A fresh backfill is now running.`,
              )
              setConfirmation("")
              router.refresh()
            })
          }}
        >
          {isPending ? "Resetting..." : "Reset Gmail ingestion data"}
        </Button>
        {message ? <p className="text-sm leading-6 text-white/56">{message}</p> : null}
      </div>
    </div>
  )
}
