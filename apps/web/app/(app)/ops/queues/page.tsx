import { listRecentJobRuns } from "@workspace/db"
import {
  getBackfillImportQueueStats,
  getAiExtractionQueueStats,
  getDocumentNormalizationQueueStats,
  getEmailSyncQueueStats,
  getSystemQueueStats,
} from "@workspace/workflows"

import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function QueueOpsPage() {
  await requireSession()

  const [
    systemStats,
    backfillStats,
    emailSyncStats,
    documentNormalizationStats,
    aiExtractionStats,
    jobRuns,
  ] = await Promise.all([
    getSystemQueueStats(),
    getBackfillImportQueueStats(),
    getEmailSyncQueueStats(),
    getDocumentNormalizationQueueStats(),
    getAiExtractionQueueStats(),
    listRecentJobRuns(30),
  ])
  const queueCards: Array<[string, Record<string, number>]> = [
    ["System queue", systemStats],
    ["Backfill queue", backfillStats],
    ["Email sync queue", emailSyncStats],
    ["Document normalization queue", documentNormalizationStats],
    ["AI extraction queue", aiExtractionStats],
  ]

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Queue operations</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Internal queue visibility for the worker runtime across ingestion,
          normalization, and extraction. This page is owner-protected and surfaces
          queue depth alongside recent lifecycle records.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {queueCards.map(([label, stats]) => (
          <div key={label} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-950">{label}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                    {key}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Recent job runs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Queue</th>
                <th className="pb-3 pr-4">Job</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Attempts</th>
                <th className="pb-3 pr-4">Key</th>
              </tr>
            </thead>
            <tbody className="text-zinc-700">
              {jobRuns.map((jobRun) => (
                <tr key={jobRun.id} className="border-t border-zinc-100">
                  <td className="py-3 pr-4">{jobRun.createdAt.toISOString()}</td>
                  <td className="py-3 pr-4">{jobRun.queueName}</td>
                  <td className="py-3 pr-4">{jobRun.jobName}</td>
                  <td className="py-3 pr-4">{jobRun.status}</td>
                  <td className="py-3 pr-4">{jobRun.attemptCount}</td>
                  <td className="py-3 pr-4">{jobRun.jobKey ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
