import assert from "node:assert/strict"
import test from "node:test"

import {
  chooseRepairMergeTarget,
  collectRepairBatchScope,
  shouldScheduleReconciliationRepair,
} from "./reconciliation-repair"

test("collectRepairBatchScope extracts and dedupes ids from succeeded job payloads", () => {
  const scope = collectRepairBatchScope([
    {
      payloadJson: {
        rawDocumentId: "raw-1",
        extractedSignalId: "sig-1",
        financialEventId: "evt-1",
      },
    },
    {
      payloadJson: {
        rawDocumentId: "raw-1",
        extractedSignalId: "sig-2",
      },
    },
    {
      payloadJson: {
        financialEventId: "evt-2",
      },
    },
    {
      payloadJson: null,
    },
  ])

  assert.deepEqual(scope, {
    rawDocumentIds: ["raw-1"],
    extractedSignalIds: ["sig-1", "sig-2"],
    financialEventIds: ["evt-1", "evt-2"],
  })
})

test("shouldScheduleReconciliationRepair only schedules when the sync accepted finance documents", () => {
  assert.equal(
    shouldScheduleReconciliationRepair({
      acceptedTransactionalCount: 0,
      acceptedObligationCount: 0,
    }),
    false,
  )

  assert.equal(
    shouldScheduleReconciliationRepair({
      acceptedTransactionalCount: 1,
      acceptedObligationCount: 0,
    }),
    true,
  )

  assert.equal(
    shouldScheduleReconciliationRepair({
      acceptedTransactionalCount: 0,
      acceptedObligationCount: 2,
    }),
    true,
  )
})

test("chooseRepairMergeTarget prefers the bank-settlement event as the survivor", () => {
  assert.equal(
    chooseRepairMergeTarget({
      currentEventId: "evt-current",
      currentIsBankSettlement: true,
      candidateEventId: "evt-candidate",
      candidateIsBankSettlement: false,
    }),
    "evt-current",
  )

  assert.equal(
    chooseRepairMergeTarget({
      currentEventId: "evt-current",
      currentIsBankSettlement: false,
      candidateEventId: "evt-candidate",
      candidateIsBankSettlement: true,
    }),
    "evt-candidate",
  )
})

test("chooseRepairMergeTarget falls back to the shortlist candidate when neither side is a bank settlement", () => {
  assert.equal(
    chooseRepairMergeTarget({
      currentEventId: "evt-current",
      currentIsBankSettlement: false,
      candidateEventId: "evt-candidate",
      candidateIsBankSettlement: false,
    }),
    "evt-candidate",
  )
})
