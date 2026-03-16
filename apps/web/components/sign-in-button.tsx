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
        variant="secondary"
        size="lg"
        className="w-full justify-center"
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
      {error ? <p className="text-sm leading-6 text-[var(--neo-coral)]">{error}</p> : null}
    </div>
  )
}
