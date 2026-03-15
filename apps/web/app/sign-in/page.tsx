import { redirect } from "next/navigation"

import { SignInButton } from "@/components/sign-in-button"
import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const session = await getServerSession()

  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-zinc-50 px-6 py-12 text-zinc-950">
      <section className="w-full max-w-lg rounded-[2rem] border border-zinc-200 bg-white p-10 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
          Irene
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">
          Owner sign-in only
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Phase 1 uses Google sign-in through Better Auth and admits only the
          allowlisted owner account(s).
        </p>
        <div className="mt-8">
          <SignInButton />
        </div>
      </section>
    </main>
  )
}
