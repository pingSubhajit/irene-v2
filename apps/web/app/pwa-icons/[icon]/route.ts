import { access, readFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

const ICON_NAMES = new Set([
  "icon-192.png",
  "icon-512.png",
  "icon-180.png",
  "icon-maskable-512.png",
  "shortcut-96.png",
])

async function resolveIconPath(icon: string) {
  const cwd = process.cwd().replace(`${path.sep}[project]`, "")
  const candidates = [
    path.resolve(cwd, "../../packages/assets/images/pwa", icon),
    path.resolve(cwd, "../packages/assets/images/pwa", icon),
    path.resolve(cwd, "packages/assets/images/pwa", icon),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue searching alternate workspace layouts.
    }
  }

  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ icon: string }> },
) {
  const { icon } = await context.params

  if (!ICON_NAMES.has(icon)) {
    return new NextResponse("Not found.", { status: 404 })
  }

  const filePath = await resolveIconPath(icon)

  if (!filePath) {
    return new NextResponse("Icon asset not found.", { status: 404 })
  }

  const buffer = await readFile(filePath)

  return new NextResponse(buffer, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  })
}
