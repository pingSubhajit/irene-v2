import Link from "next/link"
import { RiArrowLeftLine, RiShieldCheckLine } from "@remixicon/react"

import { DataManagementActions } from "@/components/data-management-actions"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function DataManagementPage() {
  await requireSession()

  return (
    <section className="mx-auto max-w-lg">
      <Link
        href="/settings"
        className="inline-flex py-6 text-white/50 transition hover:text-white"
      >
        <RiArrowLeftLine className="size-5" />
      </Link>

      <h1 className="text-[1.65rem] font-semibold tracking-tight text-white">
        data management
      </h1>
      <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-white/36">
        manage data resets and system rebuilds for your Irene account
      </p>

      <DataManagementActions />

      <div className="mt-16 flex items-center gap-3 border border-white/[0.06] px-4 py-3.5">
        <span className="flex size-8 items-center justify-center border border-white/10 bg-white/4 text-white/40">
          <RiShieldCheckLine className="size-4" />
        </span>
        <p className="text-sm text-white/36">
          these actions are scoped to your account only.
        </p>
      </div>
    </section>
  )
}
