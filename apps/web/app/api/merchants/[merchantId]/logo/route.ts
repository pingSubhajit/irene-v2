import { NextResponse } from "next/server"

import { getMerchantById, updateMerchant } from "@workspace/db"

import { requireSession } from "@/lib/session"

function isAllowedLogoUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "img.logo.dev"
  } catch {
    return false
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  const session = await requireSession()
  const { merchantId } = await context.params
  const payload = (await request.json()) as {
    logoUrl?: string | null
  }

  const merchant = await getMerchantById(merchantId)

  if (!merchant || merchant.userId !== session.user.id) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 })
  }

  const logoUrl = typeof payload.logoUrl === "string" ? payload.logoUrl.trim() : ""

  if (!logoUrl) {
    return NextResponse.json({ error: "A logo URL is required." }, { status: 400 })
  }

  if (!isAllowedLogoUrl(logoUrl)) {
    return NextResponse.json({ error: "Only Logo.dev image URLs are supported." }, { status: 400 })
  }

  const updated = await updateMerchant(merchantId, {
    logoUrl,
  })

  if (!updated) {
    return NextResponse.json({ error: "Could not update merchant logo." }, { status: 500 })
  }

  return NextResponse.json({
    merchant: {
      id: updated.id,
      logoUrl: updated.logoUrl,
    },
  })
}
