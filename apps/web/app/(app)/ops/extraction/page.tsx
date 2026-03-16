import {
  countFinancialEventsForUser,
  countExtractedSignalsForUser,
  countOpenReviewQueueItemsForUser,
  countRawDocumentsForUser,
  listDocumentAttachmentsForRawDocumentIds,
  listExtractedSignalsForRawDocumentIds,
  listFinancialEventSourcesForRawDocumentIds,
  listRecentModelRunsForUser,
  listRecentReviewQueueItemsForRawDocumentIds,
  listRecentRawDocumentsForUser,
  listRecentJobRunsForQueues,
  listModelRunsForRawDocumentIds,
} from "@workspace/db"
import {
  AI_EXTRACTION_QUEUE_NAME,
  DOCUMENT_NORMALIZATION_QUEUE_NAME,
  getAiExtractionQueueStats,
  getDocumentNormalizationQueueStats,
  getReconciliationQueueStats,
  RECONCILIATION_QUEUE_NAME,
} from "@workspace/workflows"

import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function ExtractionOpsPage() {
  const session = await requireSession()

  const [
    rawDocumentCount,
    extractedSignalCount,
    financialEventCount,
    openReviewCount,
    normalizationStats,
    extractionStats,
    reconciliationStats,
    recentRawDocuments,
    recentModelRuns,
    recentExtractionJobs,
  ] = await Promise.all([
    countRawDocumentsForUser(session.user.id),
    countExtractedSignalsForUser(session.user.id),
    countFinancialEventsForUser(session.user.id),
    countOpenReviewQueueItemsForUser(session.user.id),
    getDocumentNormalizationQueueStats(),
    getAiExtractionQueueStats(),
    getReconciliationQueueStats(),
    listRecentRawDocumentsForUser(session.user.id, 10),
    listRecentModelRunsForUser(session.user.id, 12),
    listRecentJobRunsForQueues(
      [
        DOCUMENT_NORMALIZATION_QUEUE_NAME,
        AI_EXTRACTION_QUEUE_NAME,
        RECONCILIATION_QUEUE_NAME,
      ],
      12,
    ),
  ])

  const rawDocumentIds = recentRawDocuments.map((document) => document.id)
  const [attachments, modelRunsByDocument, extractedSignals, eventSources, reviewItems] =
    await Promise.all([
      listDocumentAttachmentsForRawDocumentIds(rawDocumentIds),
      listModelRunsForRawDocumentIds(rawDocumentIds),
      listExtractedSignalsForRawDocumentIds(rawDocumentIds),
      listFinancialEventSourcesForRawDocumentIds(rawDocumentIds),
      listRecentReviewQueueItemsForRawDocumentIds(rawDocumentIds),
    ])

  const attachmentsByDocument = new Map<string, typeof attachments>()
  for (const attachment of attachments) {
    const existing = attachmentsByDocument.get(attachment.rawDocumentId) ?? []
    existing.push(attachment)
    attachmentsByDocument.set(attachment.rawDocumentId, existing)
  }

  const modelRunsMap = new Map<string, typeof modelRunsByDocument>()
  for (const modelRun of modelRunsByDocument) {
    if (!modelRun.rawDocumentId) {
      continue
    }
    const existing = modelRunsMap.get(modelRun.rawDocumentId) ?? []
    existing.push(modelRun)
    modelRunsMap.set(modelRun.rawDocumentId, existing)
  }

  const signalsMap = new Map<string, typeof extractedSignals>()
  for (const signal of extractedSignals) {
    const existing = signalsMap.get(signal.rawDocumentId) ?? []
    existing.push(signal)
    signalsMap.set(signal.rawDocumentId, existing)
  }

  const eventSourceMap = new Map<string, typeof eventSources>()
  for (const source of eventSources) {
    const rawDocumentId = source.source.rawDocumentId

    if (!rawDocumentId) {
      continue
    }

    const existing = eventSourceMap.get(rawDocumentId) ?? []
    existing.push(source)
    eventSourceMap.set(rawDocumentId, existing)
  }

  const reviewItemsMap = new Map<string, typeof reviewItems>()
  for (const reviewItem of reviewItems) {
    const rawDocumentId = reviewItem.rawDocumentId

    if (!rawDocumentId) {
      continue
    }

    const existing = reviewItemsMap.get(rawDocumentId) ?? []
    existing.push(reviewItem)
    reviewItemsMap.set(rawDocumentId, existing)
  }

  const queueCards: Array<[string, Record<string, number>]> = [
    ["Document normalization", normalizationStats],
    ["AI extraction", extractionStats],
    ["Reconciliation", reconciliationStats],
  ]

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Extraction operations</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
          Internal visibility into Phase 3 normalization and extraction. This page
          shows raw-document processing state, model audit records, and extracted
          hypotheses without presenting them as ledger truth.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Accepted raw documents" value={rawDocumentCount} />
        <MetricCard label="Extracted signals" value={extractedSignalCount} />
        <MetricCard label="Canonical ledger events" value={financialEventCount} />
        <MetricCard label="Open review items" value={openReviewCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
        <h2 className="text-lg font-semibold">Recent extraction jobs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Queue</th>
                <th className="pb-3 pr-4">Job</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Key</th>
              </tr>
            </thead>
            <tbody className="text-zinc-700">
              {recentExtractionJobs.map((jobRun) => (
                <tr key={jobRun.id} className="border-t border-zinc-100">
                  <td className="py-3 pr-4">{jobRun.createdAt.toISOString()}</td>
                  <td className="py-3 pr-4">{jobRun.queueName}</td>
                  <td className="py-3 pr-4">{jobRun.jobName}</td>
                  <td className="py-3 pr-4">{jobRun.status}</td>
                  <td className="py-3 pr-4">{jobRun.jobKey ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Recent model runs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-3 pr-4">Created</th>
                <th className="pb-3 pr-4">Task</th>
                <th className="pb-3 pr-4">Model</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Raw document</th>
              </tr>
            </thead>
            <tbody className="text-zinc-700">
              {recentModelRuns.map((modelRun) => (
                <tr key={modelRun.id} className="border-t border-zinc-100">
                  <td className="py-3 pr-4">{modelRun.createdAt.toISOString()}</td>
                  <td className="py-3 pr-4">{modelRun.taskType}</td>
                  <td className="py-3 pr-4">{modelRun.modelName}</td>
                  <td className="py-3 pr-4">{modelRun.status}</td>
                  <td className="py-3 pr-4">{modelRun.rawDocumentId ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4">
        {recentRawDocuments.map((document) => {
          const documentAttachments = attachmentsByDocument.get(document.id) ?? []
          const documentModelRuns = modelRunsMap.get(document.id) ?? []
          const documentSignals = signalsMap.get(document.id) ?? []
          const documentEventSources = eventSourceMap.get(document.id) ?? []
          const documentReviewItems = reviewItemsMap.get(document.id) ?? []

          return (
            <div
              key={document.id}
              className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-950">
                    {document.subject ?? "Untitled document"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {document.fromAddress ?? "Unknown sender"} ·{" "}
                    {document.messageTimestamp.toISOString()}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    {document.relevanceLabel ?? "unknown"} · {document.id}
                  </p>
                </div>
                <div className="grid gap-1 text-right text-sm text-zinc-600">
                  <p>{document.bodyText ? "Normalized body present" : "HTML-only or empty body"}</p>
                  <p>{documentAttachments.length} attachment(s)</p>
                  <p>{documentSignals.length} extracted signal(s)</p>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-5">
                <div>
                  <h3 className="text-sm font-medium text-zinc-950">Attachment parse state</h3>
                  <ul className="mt-3 grid gap-3 text-sm text-zinc-700">
                    {documentAttachments.length > 0 ? (
                      documentAttachments.map((attachment) => (
                        <li key={attachment.id} className="rounded-2xl bg-zinc-50 p-3">
                          <p className="font-medium">{attachment.filename}</p>
                          <p className="mt-1 text-zinc-600">
                            {attachment.mimeType} · {attachment.parseStatus}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-2xl bg-zinc-50 p-3 text-zinc-600">No attachments</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-950">Model runs</h3>
                  <ul className="mt-3 grid gap-3 text-sm text-zinc-700">
                    {documentModelRuns.length > 0 ? (
                      documentModelRuns.map((modelRun) => (
                        <li key={modelRun.id} className="rounded-2xl bg-zinc-50 p-3">
                          <p className="font-medium">{modelRun.taskType}</p>
                          <p className="mt-1 text-zinc-600">
                            {modelRun.modelName} · {modelRun.status}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-2xl bg-zinc-50 p-3 text-zinc-600">
                        No model runs yet
                      </li>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-950">Extracted signals</h3>
                  <ul className="mt-3 grid gap-3 text-sm text-zinc-700">
                    {documentSignals.length > 0 ? (
                      documentSignals.map((signal) => (
                        <li key={signal.id} className="rounded-2xl bg-zinc-50 p-3">
                          <p className="font-medium">{signal.signalType}</p>
                          <p className="mt-1 text-zinc-600">
                            {signal.candidateEventType ?? "no candidate event"} · confidence{" "}
                            {signal.confidence}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-2xl bg-zinc-50 p-3 text-zinc-600">
                        No extracted signals yet
                      </li>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-950">Reconciliation</h3>
                  <ul className="mt-3 grid gap-3 text-sm text-zinc-700">
                    {documentEventSources.length > 0 ? (
                      documentEventSources.map(({ source, event }) => (
                        <li key={source.id} className="rounded-2xl bg-zinc-50 p-3">
                          <p className="font-medium">{source.linkReason}</p>
                          <p className="mt-1 text-zinc-600">
                            Event {event?.eventType ?? "unknown"} · {event?.id ?? "n/a"}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-2xl bg-zinc-50 p-3 text-zinc-600">
                        No canonical event yet
                      </li>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-950">Review queue</h3>
                  <ul className="mt-3 grid gap-3 text-sm text-zinc-700">
                    {documentReviewItems.length > 0 ? (
                      documentReviewItems.map((reviewItem) => (
                        <li key={reviewItem.id} className="rounded-2xl bg-zinc-50 p-3">
                          <p className="font-medium">{reviewItem.status}</p>
                          <p className="mt-1 text-zinc-600">{reviewItem.title}</p>
                        </li>
                      ))
                    ) : (
                      <li className="rounded-2xl bg-zinc-50 p-3 text-zinc-600">
                        No review items
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-950">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{value}</p>
    </div>
  )
}
