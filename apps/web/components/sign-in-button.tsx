"use client"

import { useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { signInWithGoogle } from "@/lib/auth-client"

export function SignInButton() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              await signInWithGoogle()
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Unable to sign in")
            }
          })
        }}
      >
        {isPending ? "Redirecting..." : "Continue with Google"}
      </Button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
