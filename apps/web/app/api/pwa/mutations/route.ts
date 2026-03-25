import { NextResponse } from "next/server"
import { z } from "zod"

import { getPwaMutationReceipt, upsertPwaMutationReceipt } from "@workspace/db"

import { PWA_MUTATION_KINDS, type PwaMutationResult } from "@/lib/pwa/contracts"
import { executePwaMutation } from "@/lib/pwa/server-dispatch"
import { requireSession } from "@/lib/session"

const mutationRequestSchema = z.object({
  mutationId: z.string().min(1),
  userId: z.string().min(1),
  kind: z.enum(PWA_MUTATION_KINDS),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().min(1),
  idempotencyKey: z.string().min(1),
  clientRef: z.string().nullable().optional(),
})

function toHttpStatus(status: PwaMutationResult["status"]) {
  switch (status) {
    case "succeeded":
      return 200
    case "blocked_auth":
      return 403
    case "failed_retryable":
      return 503
    case "failed_terminal":
      return 400
  }
}

export async function POST(request: Request) {
  const session = await requireSession()
  const parsed = mutationRequestSchema.parse(await request.json())

  if (parsed.userId !== session.user.id) {
    return NextResponse.json(
      {
        ok: false,
        mutationId: parsed.mutationId,
        kind: parsed.kind,
        status: "blocked_auth",
        invalidateRouteKeys: [],
        errorCode: "user_mismatch",
        message: "Signed-in user does not match this queued mutation.",
      } satisfies PwaMutationResult,
      { status: 403 }
    )
  }

  const existing = await getPwaMutationReceipt({
    userId: session.user.id,
    idempotencyKey: parsed.idempotencyKey,
  })

  if (existing) {
    return NextResponse.json(existing.responseJson, {
      status: toHttpStatus(existing.status),
    })
  }

  const result = await executePwaMutation(request, parsed)

  await upsertPwaMutationReceipt({
    userId: session.user.id,
    idempotencyKey: parsed.idempotencyKey,
    mutationId: parsed.mutationId,
    kind: parsed.kind,
    requestPayloadJson: parsed.payload,
    responseJson: result as Record<string, unknown>,
    status: result.status,
  })

  return NextResponse.json(result, {
    status: toHttpStatus(result.status),
  })
}
