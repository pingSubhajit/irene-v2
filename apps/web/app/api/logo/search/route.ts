import { NextResponse } from "next/server"

import { searchLogoDotDevBrands } from "@workspace/integrations"

import { requireSession } from "@/lib/session"

export async function GET(request: Request) {
  await requireSession()

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")?.trim() ?? ""

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  try {
    const results = await searchLogoDotDevBrands(query)
    return NextResponse.json({ results })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logo search failed."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
