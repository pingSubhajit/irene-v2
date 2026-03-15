import { listRecentJobRuns } from "@workspace/db"
import { getSystemQueueStats } from "@workspace/workflows"

import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function QueueOpsPage() {
  await requireSession()

  const [stats, jobRuns] = await Promise.all([getSystemQueueStats(), listRecentJobRuns(20)])

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Queue operations</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Internal queue visibility for the Phase 1 system worker. This page is
          owner-protected and gives the operational answer this phase needs: queue
          counts plus recent job lifecycle records.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        {Object.entries(stats).map(([key, value]) => (
          <div
            key={key}
            className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              {key}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
              {value}
            </p>
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
