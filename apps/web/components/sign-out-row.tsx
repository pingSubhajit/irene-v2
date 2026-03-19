"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { signOut } from "@/lib/auth-client"

export function SignOutRow() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      className="w-full py-4 text-left text-[15px] text-white/50 transition hover:text-white disabled:opacity-40"
      onClick={() => {
        startTransition(async () => {
          await signOut()
          router.replace("/sign-in")
          router.refresh()
        })
      }}
    >
      {isPending ? "signing out…" : "sign out"}
    </button>
  )
}
