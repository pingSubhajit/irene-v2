"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { RiArrowRightSLine } from "@remixicon/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"

export function DataManagementActions() {
  return (
    <div className="mt-10 divide-y divide-white/[0.06]">
      <ResetIngestionAction />
      <ResetDatabaseAction />
    </div>
  )
}

function ResetIngestionAction() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const phrase = "RESET INGESTION"

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setConfirmation("")
          setMessage(null)
        }
      }}
    >
      <SheetTrigger asChild>
        <button className="flex w-full items-center justify-between py-5 text-left transition hover:bg-white/[0.02]">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-white">reset ingestion</p>
            <p className="mt-1 text-sm leading-relaxed text-white/28">
              wipe inbox data and start a fresh 90-day backfill
            </p>
          </div>
          <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
        </button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reset & reingest</SheetTitle>
          <SheetDescription>
            This permanently clears the ingested Gmail dataset for your account
            &mdash; raw documents, attachments, finance state, ledger events,
            and recurring models &mdash; then immediately starts a fresh
            backfill.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-6 pb-10 pt-5">
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>
              type{" "}
              <span className="font-mono text-[var(--neo-yellow)]">
                {phrase}
              </span>{" "}
              to confirm
            </span>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={phrase}
            />
          </label>

          <Button
            disabled={isPending || confirmation !== phrase}
            variant="destructive"
            onClick={() => {
              setMessage(null)
              startTransition(async () => {
                const response = await fetch("/api/debug/ingestion/reset", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ confirmation }),
                })

                if (!response.ok) {
                  setMessage("could not reset the inbox data.")
                  return
                }

                const data = await response.json()
                setMessage(
                  `deleted ${data.deletedRawDocuments} documents, ${data.deletedAttachments} attachments, ${data.deletedFinancialEvents} events. a fresh backfill is now running.`,
                )
                setConfirmation("")
                router.refresh()
              })
            }}
          >
            {isPending ? "resetting…" : "reset ingestion data"}
          </Button>

          {message && (
            <p className="text-sm leading-relaxed text-white/44">{message}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ResetDatabaseAction() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const phrase = "RESET DATABASE"

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setConfirmation("")
          setMessage(null)
        }
      }}
    >
      <SheetTrigger asChild>
        <button className="flex w-full items-center justify-between py-5 text-left transition hover:bg-white/[0.02]">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-white">reset database</p>
            <p className="mt-1 text-sm leading-relaxed text-white/28">
              clear all stored finance state and diagnostics
            </p>
          </div>
          <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
        </button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reset database state</SheetTitle>
          <SheetDescription>
            This clears Irene&apos;s saved product state for your account while
            keeping authentication and the Gmail link intact. Nothing is
            re-synced until you manually trigger it again.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-6 pb-10 pt-5">
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>
              type{" "}
              <span className="font-mono text-[var(--neo-coral)]">
                {phrase}
              </span>{" "}
              to confirm
            </span>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={phrase}
            />
          </label>

          <Button
            disabled={isPending || confirmation !== phrase}
            variant="destructive"
            onClick={() => {
              setMessage(null)
              startTransition(async () => {
                const response = await fetch("/api/debug/database/reset", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ confirmation }),
                })

                if (!response.ok) {
                  setMessage("could not reset Irene's stored data.")
                  return
                }

                const data = await response.json()
                setMessage(
                  `deleted ${data.deletedRawDocuments} emails, ${data.deletedAttachments} attachments, ${data.deletedFinancialEvents} events, ${data.deletedModelRuns} model runs. Gmail remains linked.`,
                )
                setConfirmation("")
                router.refresh()
              })
            }}
          >
            {isPending ? "resetting…" : "reset database state"}
          </Button>

          {message && (
            <p className="text-sm leading-relaxed text-white/44">{message}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
