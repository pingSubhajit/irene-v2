import { and, eq } from "drizzle-orm"

import { db } from "./client"
import {
  pwaMutationReceipts,
  type PwaMutationReceiptSelect,
  type PwaMutationReceiptStatus,
} from "./schema"

type UpsertPwaMutationReceiptInput = {
  userId: string
  idempotencyKey: string
  mutationId: string
  kind: string
  requestPayloadJson: Record<string, unknown> | null
  responseJson: Record<string, unknown>
  status: PwaMutationReceiptStatus
}

export async function getPwaMutationReceipt(input: {
  userId: string
  idempotencyKey: string
}) {
  const [receipt] = await db
    .select()
    .from(pwaMutationReceipts)
    .where(
      and(
        eq(pwaMutationReceipts.userId, input.userId),
        eq(pwaMutationReceipts.idempotencyKey, input.idempotencyKey)
      )
    )
    .limit(1)

  return receipt ?? null
}

export async function upsertPwaMutationReceipt(
  input: UpsertPwaMutationReceiptInput
) {
  const [receipt] = await db
    .insert(pwaMutationReceipts)
    .values({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      mutationId: input.mutationId,
      kind: input.kind,
      requestPayloadJson: input.requestPayloadJson ?? {},
      responseJson: input.responseJson,
      status: input.status,
    })
    .onConflictDoUpdate({
      target: [pwaMutationReceipts.userId, pwaMutationReceipts.idempotencyKey],
      set: {
        mutationId: input.mutationId,
        kind: input.kind,
        requestPayloadJson: input.requestPayloadJson ?? {},
        responseJson: input.responseJson,
        status: input.status,
        updatedAt: new Date(),
      },
    })
    .returning()

  if (!receipt) {
    throw new Error("Failed to upsert pwa mutation receipt")
  }

  return receipt
}

export function isSuccessfulPwaReceipt(
  receipt: Pick<PwaMutationReceiptSelect, "status"> | null | undefined
) {
  return receipt?.status === "succeeded"
}
