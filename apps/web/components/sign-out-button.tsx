"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { signOut } from "@/lib/auth-client"

export function SignOutButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      disabled={isPending}
      variant="outline"
      onClick={() => {
        startTransition(async () => {
          await signOut()
          router.replace("/sign-in")
          router.refresh()
        })
      }}
    >
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  )
}
