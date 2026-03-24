"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, type ChangeEvent } from "react"

import type { MemoryAuthoringResult } from "@workspace/ai"

type SettingsMemoryEditorProps = {
  mode: "create" | "edit"
  memoryFactId?: string
  initialAuthoredText?: string | null
}

export function SettingsMemoryEditor({
  mode,
  memoryFactId,
  initialAuthoredText,
}: SettingsMemoryEditorProps) {
  const router = useRouter()
  const [authoredText, setAuthoredText] = useState(initialAuthoredText ?? "")
  const [preview, setPreview] = useState<MemoryAuthoringResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const canSave = useMemo(() => {
    return Boolean(
      preview &&
        !preview.needsClarification &&
        preview.memories.length > 0 &&
        authoredText.trim().length >= 8,
    )
  }, [authoredText, preview])

  async function handleInterpret() {
    setIsInterpreting(true)
    setError(null)

    try {
      const response = await fetch("/api/settings/memory", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "interpret",
          authoredText,
        }),
      })

      const data = (await response.json()) as
        | { ok: true; result: MemoryAuthoringResult }
        | { ok: false; error: string }

      if (!response.ok || !data.ok) {
        setPreview(null)
        setError(data.ok ? "I couldn't interpret that memory yet." : data.error)
        return
      }

      setPreview(data.result)
      setError(data.result.needsClarification ? data.result.clarificationMessage ?? null : null)
    } catch {
      setPreview(null)
      setError("I couldn't interpret that memory yet. Try again in a moment.")
    } finally {
      setIsInterpreting(false)
    }
  }

  async function handleSave() {
    if (!preview) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/settings/memory", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: mode === "edit" ? "replace" : "create",
          memoryFactId,
          authoredText,
          candidates: preview.memories,
        }),
      })
      const data = (await response.json()) as
        | { ok: true; redirectTo: string }
        | { ok: false; error: string }

      if (!response.ok || !data.ok) {
        setError(data.ok ? "I couldn't save that memory." : data.error)
        return
      }

      router.push(data.redirectTo)
      router.refresh()
    } catch {
      setError("I couldn't save that memory yet. Try again in a moment.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-8">
      <section className="border-t border-white/[0.06]">
        <div className="py-5">
          <p className="neo-kicker">Your note</p>
          <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-white/32">
            Keep it focused and natural. Irene will translate it into structured memory behind the scenes.
          </p>
        </div>
        <textarea
          value={authoredText}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setAuthoredText(event.target.value)
          }
          placeholder="Amazon charges on card 1008 are usually subscriptions."
          rows={5}
          className="w-full resize-none border border-white/[0.08] bg-transparent px-4 py-3 text-[15px] leading-7 text-white outline-none transition placeholder:text-white/18 focus:border-white/20"
        />
      </section>

      {error ? (
        <div className="border-l-2 border-[#ff8268] bg-[rgba(255,130,104,0.04)] px-4 py-3">
          <p className="text-sm leading-relaxed text-white/68">{error}</p>
        </div>
      ) : null}

      {preview ? (
        <section className="border-t border-white/[0.06]">
          <div className="py-5">
            <p className="neo-kicker">Preview</p>
            <p className="mt-2 text-sm leading-relaxed text-white/32">
              Irene will remember these ideas if you confirm.
            </p>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {preview.memories.map((candidate, index) => (
              <div key={`${candidate.factType}-${index}`} className="py-4 first:pt-0">
                <p className="text-[15px] leading-6 text-white">{candidate.summaryText}</p>
                {candidate.detailText ? (
                  <p className="mt-1 text-sm leading-6 text-white/30">{candidate.detailText}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-6">
        <button
          type="button"
          onClick={handleInterpret}
          disabled={isInterpreting || authoredText.trim().length < 8}
          className="min-h-11 border border-white/[0.08] px-4 text-sm text-white/72 transition hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:text-white/18"
        >
          {isInterpreting ? "Interpreting..." : mode === "edit" ? "Rewrite memory" : "Teach Irene"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="min-h-11 border border-white/[0.08] px-4 text-sm text-white transition hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:text-white/24"
        >
          {isSaving ? "Saving..." : "Save memory"}
        </button>
      </div>
    </div>
  )
}
