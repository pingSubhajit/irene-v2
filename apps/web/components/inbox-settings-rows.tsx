"use client"

import { useState, useTransition } from "react"

import { RiArrowRightSLine } from "@remixicon/react"

const rowClassName =
  "flex w-full items-center justify-between py-4 text-left transition hover:bg-white/[0.02] disabled:opacity-40"

type InboxSettingsRowsProps = {
  connected: boolean
}

export function InboxSettingsRows({ connected }: InboxSettingsRowsProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div className="divide-y divide-white/[0.06]">
      <a href="/api/integrations/email/google/connect" className={rowClassName}>
        <span className="text-[15px] text-white">
          {connected ? "reconnect gmail" : "connect gmail"}
        </span>
        <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
      </a>

      {connected && (
        <>
          <button
            disabled={isPending}
            className={rowClassName}
            onClick={() => {
              setMessage(null)
              startTransition(async () => {
                const response = await fetch(
                  "/api/integrations/email/google/sync",
                  { method: "POST" },
                )

                if (!response.ok) {
                  setMessage("could not queue a sync. try again in a moment.")
                  return
                }

                await response.json()
                setMessage(
                  "sync queued. Irene will refresh the inbox shortly.",
                )
              })
            }}
          >
            <span className="text-[15px] text-white">
              {isPending ? "queueing…" : "sync now"}
            </span>
            <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
          </button>

          <button
            disabled={isPending}
            className={rowClassName}
            onClick={() => {
              setMessage(null)
              startTransition(async () => {
                const response = await fetch(
                  "/api/integrations/email/google/disconnect",
                  { method: "POST" },
                )

                if (!response.ok) {
                  setMessage("could not disconnect Gmail right now.")
                  return
                }

                window.location.reload()
              })
            }}
          >
            <span className="text-[15px] text-red-400/70">disconnect</span>
            <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
          </button>
        </>
      )}

      {message && (
        <p className="py-3 text-sm leading-relaxed text-white/44">{message}</p>
      )}
    </div>
  )
}
