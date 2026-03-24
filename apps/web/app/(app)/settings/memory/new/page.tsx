import type { Metadata } from "next"
import {
  SettingsFootnote,
  SettingsSubpageShell,
} from "@/components/settings-accounts-shared"
import { SettingsMemoryEditor } from "@/components/settings-memory-editor"
import { createPrivateMetadata } from "@/lib/metadata"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const metadata: Metadata = createPrivateMetadata({
  title: "New memory",
  description: "Add a memory in Irene.",
})

export default async function MemoryNewPage() {
  await requireSession()

  return (
    <SettingsSubpageShell
      backHref="/settings/memory"
      title="teach Irene"
      description="Write one plain-language note and Irene will turn it into reusable memory behind the scenes."
    >
      <SettingsMemoryEditor mode="create" />
      <SettingsFootnote>
        Keep each note focused. If you mean two unrelated things, teach them as separate memories.
      </SettingsFootnote>
    </SettingsSubpageShell>
  )
}
