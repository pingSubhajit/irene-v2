"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  RiCheckLine,
  RiCloseLine,
  RiFileCopyLine,
  RiLoader4Line,
  RiRefreshLine,
  RiTimeLine,
} from "@remixicon/react"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

type ModelRunRow = {
  id: string
  taskType: string
  provider: string
  modelName: string
  status: string
  errorMessage: string | null
  resultJson?: Record<string, unknown> | null
  requestId: string | null
  createdAt: Date
  retryAction?: {
    extractedSignalId?: string | null
    rawDocumentId?: string | null
    financialEventId?: string | null
  } | null
}

type ModelRunListProps = {
  modelRuns: ModelRunRow[]
}

export function ModelRunList({ modelRuns }: ModelRunListProps) {
  const router = useRouter()
  const [selectedRun, setSelectedRun] = useState<ModelRunRow | null>(null)
  const [copyLabel, setCopyLabel] = useState("Copy details")
  const [retryLabel, setRetryLabel] = useState("Retry")
  const [isRetryPending, startRetryTransition] = useTransition()

  const handleRetry = (modelRun: ModelRunRow) => {
    startRetryTransition(() => {
      void (async () => {
        setRetryLabel("Retrying...")

        try {
          const response = await fetch("/api/model-run/retry", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              modelRunId: modelRun.id,
              extractedSignalId: modelRun.retryAction?.extractedSignalId,
              rawDocumentId: modelRun.retryAction?.rawDocumentId,
              financialEventId: modelRun.retryAction?.financialEventId,
            }),
          })

          if (!response.ok) {
            setRetryLabel("Retry failed")
            return
          }

          setRetryLabel("Retry queued")
          router.refresh()
        } catch {
          setRetryLabel("Retry failed")
        }
      })()
    })
  }

  return (
    <>
      <TooltipProvider>
        <div className="divide-y divide-white/[0.06]">
          {modelRuns.map((modelRun) => {
            const isFailed = modelRun.status === "failed"
            const hasDetails = isFailed || Boolean(modelRun.resultJson)

            if (hasDetails) {
              return (
                <button
                  key={modelRun.id}
                  type="button"
                  onClick={() => {
                    setSelectedRun(modelRun)
                    setCopyLabel("Copy details")
                    setRetryLabel("Retry")
                  }}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-left transition hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {modelRun.taskType}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-white/28">
                      {modelRun.provider} · {modelRun.modelName}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        aria-label={modelRun.status}
                        className="flex size-7 shrink-0 items-center justify-center text-white/68"
                      >
                        <ModelRunStatusIcon status={modelRun.status} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {isFailed ? "Failed. Tap to inspect error." : "Tap to inspect decision."}
                    </TooltipContent>
                  </Tooltip>
                </button>
              )
            }

            return (
              <div
                key={modelRun.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {modelRun.taskType}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-white/28">
                    {modelRun.provider} · {modelRun.modelName}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      aria-label={modelRun.status}
                      className="flex size-7 shrink-0 items-center justify-center text-white/68"
                    >
                      <ModelRunStatusIcon status={modelRun.status} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {modelRun.status}
                  </TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </div>
      </TooltipProvider>

      <Sheet
        open={Boolean(selectedRun)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setSelectedRun(null)
            setCopyLabel("Copy details")
            setRetryLabel("Retry")
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="border-t border-white/8 bg-[rgba(12,12,14,0.98)] pb-6"
          showCloseButton
        >
          <SheetHeader className="px-5 pt-0 sm:px-6">
            <SheetTitle>
              {selectedRun?.status === "failed" ? "Model run failure" : "Model run details"}
            </SheetTitle>
            <SheetDescription>
              {selectedRun?.taskType ?? "Unknown task"}
            </SheetDescription>
            <p className="text-sm text-white/34">
              {selectedRun?.provider ?? "unknown"} · {selectedRun?.modelName ?? "unknown"}
            </p>
          </SheetHeader>

          <div className="px-5 pt-5 sm:px-6">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/28">
                  {selectedRun?.status === "failed" ? "Error" : "Result"}
                </p>
                {selectedRun?.requestId ? (
                  <p className="mt-1 truncate text-sm text-white/34">
                    request {selectedRun.requestId}
                  </p>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={async () => {
                  const detailsText = formatModelRunDetails(selectedRun)

                  try {
                    await navigator.clipboard.writeText(detailsText)
                    setCopyLabel("Copied")
                  } catch {
                    setCopyLabel("Copy failed")
                  }
                }}
              >
                <RiFileCopyLine className="size-3.5" />
                {copyLabel}
              </Button>
            </div>

            {selectedRun?.status === "failed" && selectedRun.retryAction ? (
              <div className="mt-4 flex items-center justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRetryPending}
                  onClick={() => handleRetry(selectedRun)}
                >
                  <RiRefreshLine className="size-3.5" />
                  {retryLabel}
                </Button>
              </div>
            ) : null}

            <pre className="mt-4 max-h-[42svh] overflow-x-auto overflow-y-auto border border-white/8 bg-[rgba(255,255,255,0.03)] p-4 text-sm leading-6 whitespace-pre-wrap text-white/72 [overflow-wrap:anywhere]">
              {formatModelRunDetails(selectedRun)}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function formatModelRunDetails(modelRun: ModelRunRow | null) {
  if (!modelRun) {
    return "No model run selected."
  }

  if (modelRun.status === "failed") {
    return modelRun.errorMessage ?? "No error message recorded."
  }

  if (modelRun.resultJson) {
    return JSON.stringify(modelRun.resultJson, null, 2)
  }

  return "No additional result details recorded."
}

function ModelRunStatusIcon({ status }: { status: string }) {
  if (status === "succeeded") {
    return <RiCheckLine className="size-[1.125rem] text-emerald-400" />
  }

  if (status === "failed") {
    return <RiCloseLine className="size-[1.125rem] text-red-400" />
  }

  if (status === "running") {
    return <RiLoader4Line className="size-[1.125rem] animate-spin text-white/38" />
  }

  return <RiTimeLine className="size-[1.125rem] text-white/32" />
}
