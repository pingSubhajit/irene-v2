import { NextResponse } from "next/server"

import {
  getFinancialEventById,
  getModelRunById,
  getRawDocumentById,
  getExtractedSignalById,
} from "@workspace/db"

import {
  retryBalanceInference,
  retryCategoryResolution,
  retryDocumentExtraction,
} from "@/lib/recovery"
import { retryReconciliationModelRun } from "@/lib/reconciliation"
import { requireSession } from "@/lib/session"

export async function POST(request: Request) {
  const session = await requireSession()

  let payload: {
    modelRunId?: string
    extractedSignalId?: string
    rawDocumentId?: string
    financialEventId?: string
  }

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const modelRunId = String(payload.modelRunId ?? "").trim()
  const extractedSignalId = String(payload.extractedSignalId ?? "").trim()
  const rawDocumentId = String(payload.rawDocumentId ?? "").trim()
  const financialEventId = String(payload.financialEventId ?? "").trim()

  if (!modelRunId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  const [modelRun, signal, rawDocument, financialEvent] = await Promise.all([
    getModelRunById(modelRunId),
    extractedSignalId ? getExtractedSignalById(extractedSignalId) : Promise.resolve(null),
    rawDocumentId ? getRawDocumentById(rawDocumentId) : Promise.resolve(null),
    financialEventId ? getFinancialEventById(financialEventId) : Promise.resolve(null),
  ])

  if (
    !modelRun ||
    modelRun.userId !== session.user.id ||
    modelRun.status !== "failed"
  ) {
    return NextResponse.json({ error: "model_run_not_retryable" }, { status: 400 })
  }

  let jobRun

  if (modelRun.taskType === "reconciliation_resolution") {
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

    jobRun = await retryReconciliationModelRun({
      userId: session.user.id,
      extractedSignalId,
      rawDocumentId,
      modelRunId,
    })
  } else if (modelRun.taskType === "document_extraction") {
    if (!rawDocument || rawDocument.userId !== session.user.id) {
      return NextResponse.json({ error: "raw_document_mismatch" }, { status: 400 })
    }

    jobRun = await retryDocumentExtraction({
      userId: session.user.id,
      rawDocumentId,
    })
  } else if (modelRun.taskType === "balance_inference") {
    if (!rawDocument || rawDocument.userId !== session.user.id) {
      return NextResponse.json({ error: "raw_document_mismatch" }, { status: 400 })
    }

    jobRun = await retryBalanceInference({
      userId: session.user.id,
      rawDocumentId,
    })
  } else if (modelRun.taskType === "category_resolution") {
    if (!financialEvent || financialEvent.userId !== session.user.id) {
      return NextResponse.json({ error: "event_mismatch" }, { status: 400 })
    }

    jobRun = await retryCategoryResolution({
      userId: session.user.id,
      financialEventId,
    })
  } else {
    return NextResponse.json({ error: "model_run_not_retryable" }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    jobRunId: jobRun.id,
  })
}
