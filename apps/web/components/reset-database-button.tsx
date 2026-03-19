"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

const CONFIRMATION_PHRASE = "RESET DATABASE"

type ResetDatabaseResponse = {
  deletedRawDocuments: number
  deletedAttachments: number
  deletedStorageObjects: number
  deletedRecurringObligations: number
  deletedIncomeStreams: number
  deletedReviewItems: number
  deletedFinancialEvents: number
  deletedExtractedSignals: number
  deletedModelRuns: number
  deletedJobRuns: number
}

export function ResetDatabaseButton() {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const disabled = isPending || confirmation !== CONFIRMATION_PHRASE

  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-white/56">
        This clears Irene&apos;s saved product state for your account while keeping
        authentication and the Gmail link intact. Nothing is re-synced until you
        manually trigger it again.
      </p>

      <label className="grid gap-2 text-sm font-medium text-white">
        <span>
          Type{" "}
          <span className="font-mono text-[var(--neo-coral)]">
            {CONFIRMATION_PHRASE}
          </span>{" "}
          to confirm
        </span>
        <Input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={CONFIRMATION_PHRASE}
        />
      </label>

      <div className="grid gap-3">
        <Button
          disabled={disabled}
          variant="destructive"
          onClick={() => {
            setMessage(null)
            startTransition(async () => {
              const response = await fetch("/api/debug/database/reset", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  confirmation,
                }),
              })

              if (!response.ok) {
                setMessage("Could not reset Irene's stored data.")
                return
              }

              const data = (await response.json()) as ResetDatabaseResponse
              setMessage(
                `Deleted ${data.deletedRawDocuments} emails, ${data.deletedAttachments} attachments, ${data.deletedExtractedSignals} signals, ${data.deletedFinancialEvents} ledger events, ${data.deletedRecurringObligations} recurring models, ${data.deletedIncomeStreams} income streams, ${data.deletedReviewItems} review items, ${data.deletedModelRuns} model runs, ${data.deletedJobRuns} job runs, and ${data.deletedStorageObjects} stored objects. Gmail remains linked and idle.`,
              )
              setConfirmation("")
              router.refresh()
            })
          }}
        >
          {isPending ? "Resetting..." : "Reset Irene database state"}
        </Button>
        {message ? <p className="text-sm leading-6 text-white/56">{message}</p> : null}
      </div>
    </div>
  )
}
