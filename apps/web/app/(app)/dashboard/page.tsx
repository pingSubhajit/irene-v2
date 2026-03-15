import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const session = await requireSession()

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
          Phase 2
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Gmail ingestion foundation ready
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          The app can now connect the owner inbox, backfill recent finance-related
          Gmail messages, store accepted raw documents and attachments, and keep the
          ingestion pipeline synced through worker jobs.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Owner account</p>
          <p className="mt-2 text-sm text-zinc-600">{session.user.email}</p>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-zinc-950">Current scope</p>
          <p className="mt-2 text-sm text-zinc-600">
            Gmail connection, finance-email ingestion, raw document storage, attachment
            capture, and queue-backed sync operations.
          </p>
        </div>
      </div>
    </section>
  )
}
