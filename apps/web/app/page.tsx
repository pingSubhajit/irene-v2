import { redirect } from "next/navigation"

import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function Page() {
  const session = await getServerSession()

  redirect(session ? "/dashboard" : "/sign-in")
}
