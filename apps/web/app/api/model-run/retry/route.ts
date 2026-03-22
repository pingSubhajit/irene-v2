import { NextResponse } from "next/server"

import {
  getExtractedSignalById,
  getModelRunById,
  getRawDocumentById,
} from "@workspace/db"

import { retryReconciliationModelRun } from "@/lib/reconciliation"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()

  let payload: {
    modelRunId?: string
    extractedSignalId?: string
    rawDocumentId?: string
  }

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const modelRunId = String(payload.modelRunId ?? "").trim()
  const extractedSignalId = String(payload.extractedSignalId ?? "").trim()
  const rawDocumentId = String(payload.rawDocumentId ?? "").trim()

  if (!modelRunId || !extractedSignalId || !rawDocumentId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  const [modelRun, signal, rawDocument] = await Promise.all([
    getModelRunById(modelRunId),
    getExtractedSignalById(extractedSignalId),
    getRawDocumentById(rawDocumentId),
  ])

  if (
    !modelRun ||
    modelRun.userId !== session.user.id ||
    modelRun.taskType !== "reconciliation_resolution" ||
    modelRun.status !== "failed"
  ) {
    return NextResponse.json({ error: "model_run_not_retryable" }, { status: 400 })
  }

  if (
    !signal ||
    signal.userId !== session.user.id ||
    signal.rawDocumentId !== rawDocumentId
  ) {
    return NextResponse.json({ error: "signal_mismatch" }, { status: 400 })
  }

  if (
    !rawDocument ||
    rawDocument.userId !== session.user.id ||
    modelRun.rawDocumentId !== rawDocument.id
  ) {
    return NextResponse.json({ error: "raw_document_mismatch" }, { status: 400 })
  }

  const jobRun = await retryReconciliationModelRun({
    userId: session.user.id,
    extractedSignalId,
    rawDocumentId,
    modelRunId,
  })

  return NextResponse.json({
    ok: true,
    jobRunId: jobRun.id,
  })
}
