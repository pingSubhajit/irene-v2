import Link from "next/link"
import { redirect } from "next/navigation"

import { getUserSettings } from "@workspace/db"

import { SignInButton } from "@/components/sign-in-button"
import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const session = await getServerSession()

  if (session) {
    const settings = await getUserSettings(session.user.id)
    redirect(settings.onboardingCompletedAt ? "/dashboard" : "/onboarding")
  }

  return (
    <main className="min-h-svh bg-[var(--neo-black)] text-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-5 pb-16 pt-5 md:px-8 md:pb-24 md:pt-6">
        <header className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
          <p className="neo-kicker text-white/66">Irene</p>
          <Link
            href="/"
            className="cursor-pointer text-[0.72rem] font-semibold tracking-[0.22em] text-white/54 uppercase transition hover:text-white"
          >
            Back
          </Link>
        </header>

        <section className="flex min-h-[calc(100svh-8rem)] flex-col justify-center py-12 md:py-16">
          <div className="max-w-2xl">
            <p className="text-[0.72rem] font-medium tracking-[0.16em] text-white/42 uppercase">
              Sign-in
            </p>
            <h1 className="mt-3 max-w-[10ch] font-display text-[3rem] leading-[0.94] text-white md:text-[4.8rem]">
              continue into
              <br />
              your money
              <br />
              picture.
            </h1>
            <p className="mt-6 max-w-[36rem] text-[0.98rem] leading-7 text-white/58 md:text-[1.02rem]">
              Irene is private by default. Sign in with an allowlisted Google
              account so the app can read the relevant inbox evidence and start
              building your ledger immediately.
            </p>
          </div>

          <div className="mt-10 grid gap-10 border-t border-white/8 pt-6 md:grid-cols-[minmax(0,1fr)_240px] md:items-start">
            <div className="w-full max-w-sm">
              <SignInButton />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
