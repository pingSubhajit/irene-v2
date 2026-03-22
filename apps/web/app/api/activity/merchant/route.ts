import { NextResponse } from "next/server"

import {
  getCategoryById,
  getMerchantById,
  mergeMerchants,
  updateMerchant,
  upsertMerchantAliases,
} from "@workspace/db"

import { recordFeedbackEvent } from "@/lib/feedback"
import { requireSession } from "@/lib/session"

function redirectToTarget(request: Request, redirectTo: string, status: string) {
  const url = new URL(redirectTo.startsWith("/") ? redirectTo : "/activity", request.url)
  url.searchParams.set("status", status)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const session = await requireSession()
  const formData = await request.formData()
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const redirectTo = String(formData.get("redirectTo") ?? "/activity").trim()
  const displayName = String(formData.get("displayName") ?? "").trim()
  const defaultCategoryId = String(formData.get("defaultCategoryId") ?? "").trim()
  const mergeIntoMerchantId = String(formData.get("mergeIntoMerchantId") ?? "").trim()

  if (!merchantId) {
    return redirectToTarget(request, redirectTo, "merchant-invalid")
  }

  const previousMerchant = await getMerchantById(merchantId)
  if (!previousMerchant || previousMerchant.userId !== session.user.id) {
    return redirectToTarget(request, redirectTo, "merchant-invalid")
  }

  if (mergeIntoMerchantId && mergeIntoMerchantId !== merchantId) {
    const targetMerchant = await getMerchantById(mergeIntoMerchantId)
    if (!targetMerchant || targetMerchant.userId !== session.user.id) {
      return redirectToTarget(request, redirectTo, "merchant-invalid")
    }

    await mergeMerchants({
      canonicalMerchantId: targetMerchant.id,
      duplicateMerchantIds: [previousMerchant.id],
    })

    await upsertMerchantAliases({
      merchantId: targetMerchant.id,
      aliases: [
        {
          aliasText: previousMerchant.displayName,
          source: "user_merge",
          confidence: 1,
        },
      ],
    })

    await recordFeedbackEvent({
      userId: session.user.id,
      targetType: "merchant",
      targetId: previousMerchant.id,
      correctionType: "merge_merchant",
      sourceSurface: "activity_detail",
      previousValue: {
        merchantId: previousMerchant.id,
        displayName: previousMerchant.displayName,
        defaultCategory: previousMerchant.defaultCategory,
      },
      newValue: {
        mergedIntoMerchantId: targetMerchant.id,
        mergedIntoDisplayName: targetMerchant.displayName,
      },
    })

    return redirectToTarget(request, redirectTo, "merchant-merged")
  }

  let normalizedCategoryId: string | null | undefined
  if (defaultCategoryId) {
    const category = await getCategoryById(session.user.id, defaultCategoryId)
    if (!category) {
      return redirectToTarget(request, redirectTo, "merchant-invalid")
    }
    normalizedCategoryId = category.id
  } else if (formData.has("defaultCategoryId")) {
    normalizedCategoryId = null
  }

  const updatedMerchant = await updateMerchant(merchantId, {
    displayName: displayName || undefined,
    defaultCategory: normalizedCategoryId,
  })

  if (!updatedMerchant) {
    return redirectToTarget(request, redirectTo, "merchant-invalid")
  }

  if (displayName && displayName !== previousMerchant.displayName) {
    await upsertMerchantAliases({
      merchantId: updatedMerchant.id,
      aliases: [
        {
          aliasText: previousMerchant.displayName,
          source: "user_rename",
          confidence: 1,
        },
      ],
    })
  }

  await recordFeedbackEvent({
    userId: session.user.id,
    targetType: "merchant",
    targetId: updatedMerchant.id,
    correctionType: "update_merchant",
    sourceSurface: "activity_detail",
    previousValue: {
      displayName: previousMerchant.displayName,
      defaultCategory: previousMerchant.defaultCategory,
    },
    newValue: {
      displayName: updatedMerchant.displayName,
      defaultCategory: updatedMerchant.defaultCategory,
    },
  })

  return redirectToTarget(request, redirectTo, "merchant-updated")
}
