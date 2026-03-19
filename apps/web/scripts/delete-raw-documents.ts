import { isNotNull, sql } from "drizzle-orm"

import {
  closeDatabase,
  db,
  financialEventSources,
  paymentInstrumentObservations,
  rawDocuments,
  reviewQueueItems,
} from "@workspace/db"
import { createLogger } from "@workspace/observability"

const logger = createLogger("scripts.delete-raw-documents")
const confirmationFlag = "--yes"

function hasConfirmationFlag() {
  return process.argv.includes(confirmationFlag)
}

async function main() {
  if (!hasConfirmationFlag()) {
    logger.warn("Refusing to delete raw_document rows without confirmation", {
      requiredFlag: confirmationFlag,
    })
    process.exitCode = 1
    return
  }

  const result = await db.transaction(async (tx) => {
    const [result] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(rawDocuments)

    if (!result || result.count === 0) {
      return {
        deletedRawDocuments: 0,
        deletedFinancialEventSources: 0,
        deletedReviewQueueItems: 0,
        deletedPaymentInstrumentObservations: 0,
      }
    }

    const deletedFinancialEventSources = await tx
      .delete(financialEventSources)
      .where(isNotNull(financialEventSources.rawDocumentId))
      .returning({ id: financialEventSources.id })

    const deletedReviewQueueItems = await tx
      .delete(reviewQueueItems)
      .where(isNotNull(reviewQueueItems.rawDocumentId))
      .returning({ id: reviewQueueItems.id })

    const deletedPaymentInstrumentObservations = await tx
      .delete(paymentInstrumentObservations)
      .where(isNotNull(paymentInstrumentObservations.rawDocumentId))
      .returning({ id: paymentInstrumentObservations.id })

    await tx.delete(rawDocuments)

    return {
      deletedRawDocuments: result.count,
      deletedFinancialEventSources: deletedFinancialEventSources.length,
      deletedReviewQueueItems: deletedReviewQueueItems.length,
      deletedPaymentInstrumentObservations: deletedPaymentInstrumentObservations.length,
    }
  })

  logger.info("Deleted all raw_document rows", {
    ...result,
  })
}

main()
  .catch((error) => {
    logger.errorWithCause("Failed to delete raw_document rows", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDatabase()
  })
