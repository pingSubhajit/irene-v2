"use client"

import { useState, useTransition, type ChangeEvent } from "react"
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
import { cn } from "@workspace/ui/lib/utils"

const RESET_BACKFILL_PRESETS = [
  { value: "last_24_hours", label: "last 24 hours" },
  { value: "last_3_days", label: "last 3 days" },
  { value: "last_week", label: "last week" },
  { value: "last_2_weeks", label: "last 2 weeks" },
  { value: "last_month", label: "last month" },
  { value: "last_quarter", label: "last quarter" },
] as const

type ResetBackfillPreset = (typeof RESET_BACKFILL_PRESETS)[number]["value"]

export function DataManagementActions() {
  return (
    <div className="mt-10 divide-y divide-white/[0.06]">
      <ResetBackfillAction />
      <ResetIngestionAction />
      <ResetDatabaseAction />
    </div>
  )
}

function ResetBackfillAction() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<ResetBackfillPreset>("last_week")
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const phrase = "RESET & BACKFILL"

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setPreset("last_week")
          setConfirmation("")
          setMessage(null)
        }
      }}
    >
      <SheetTrigger asChild>
        <button className="flex w-full items-center justify-between py-5 text-left transition hover:bg-white/[0.02]">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-white">reset &amp; backfill</p>
            <p className="mt-1 text-sm leading-relaxed text-white/28">
              rewind a recent Gmail window, clear its derived state, and backfill it again
            </p>
          </div>
          <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
        </button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reset &amp; backfill window</SheetTitle>
          <SheetDescription>
            This removes Gmail emails and derived finance state inside the selected window, then
            re-runs Gmail backfill from that point forward.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 px-6 pb-10 pt-5">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-white">window</p>
            <div className="grid grid-cols-2 gap-2">
              {RESET_BACKFILL_PRESETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "rounded-none border px-3 py-2.5 text-left text-sm text-white/54 transition",
                    preset === option.value
                      ? "border-[var(--neo-yellow)] bg-[var(--neo-yellow)]/10 text-white"
                      : "border-white/[0.08] hover:bg-white/[0.02]",
                  )}
                  onClick={() => setPreset(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-medium text-white">
            <span>
              type <span className="font-mono text-[var(--neo-yellow)]">{phrase}</span> to confirm
            </span>
            <Input
              value={confirmation}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setConfirmation(event.target.value)
              }
              placeholder={phrase}
            />
          </label>

          <Button
            disabled={isPending || confirmation !== phrase}
            variant="destructive"
            onClick={() => {
              setMessage(null)
              startTransition(async () => {
                const response = await fetch("/api/settings/data/reset-backfill", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ preset, confirmation }),
                })

                if (!response.ok) {
                  setMessage("could not reset and backfill that window.")
                  return
                }

                const data = await response.json()
                setMessage(
                  `deleted ${data.deletedRawDocuments} emails and ${data.deletedFinancialEvents} events. the selected window is being backfilled again.`,
                )
                setConfirmation("")
                router.refresh()
              })
            }}
          >
            {isPending ? "rewinding…" : "reset & backfill"}
          </Button>

          {message && (
            <p className="text-sm leading-relaxed text-white/44">{message}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
      onOpenChange={(nextOpen: boolean) => {
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
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setConfirmation(event.target.value)
              }
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
      onOpenChange={(nextOpen: boolean) => {
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
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setConfirmation(event.target.value)
              }
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
