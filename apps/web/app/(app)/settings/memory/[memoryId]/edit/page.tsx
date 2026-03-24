import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getMemoryFactById } from "@workspace/db"

import {
  SettingsFootnote,
  SettingsSubpageShell,
} from "@/components/settings-accounts-shared"
import { SettingsMemoryEditor } from "@/components/settings-memory-editor"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "Edit memory",
  description: "Edit a memory in Irene.",
})

type MemoryEditPageProps = {
  params: Promise<{ memoryId: string }>
}

export default async function MemoryEditPage({ params }: MemoryEditPageProps) {
  const session = await requireSession()
  const { memoryId } = await params
  const fact = await getMemoryFactById(memoryId)

  if (!fact || fact.userId !== session.user.id) {
    notFound()
  }

  return (
    <SettingsSubpageShell
      backHref={`/settings/memory/${fact.id}`}
      title="edit memory"
      description="Rewrite the memory in plain language. Irene will replace the current fact with the new interpretation."
    >
      <SettingsMemoryEditor
        mode="edit"
        memoryFactId={fact.id}
        initialAuthoredText={fact.authoredText ?? fact.summaryText}
      />
      <SettingsFootnote>
        Editing a memory replaces the old version instead of mutating the original record in place.
      </SettingsFootnote>
    </SettingsSubpageShell>
  )
}
