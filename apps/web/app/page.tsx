import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { SignInButton } from "@/components/sign-in-button"
import { createPublicMetadata } from "@/lib/metadata"
import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = createPublicMetadata({
  title: "Irene",
  description:
    "Calm money clarity from your inbox.",
  path: "/",
})

const principles = [
  "Receipts, alerts, and reminders resolve into one readable money trail.",
  "Recurring commitments stay visible before they become surprises.",
  "Review keeps the original source close to every uncertain decision.",
] as const

const faqs = [
  {
    question: "Who is Irene for?",
    answer:
      "People whose financial evidence mostly arrives in email: card alerts, receipts, subscription renewals, refund confirmations, and due reminders.",
  },
  {
    question: "Does Irene connect to banks or move money?",
    answer:
      "No. Irene reads evidence from your inbox and builds a ledger around it. The product is for clarity, not payment execution.",
  },
  {
    question: "Why Google sign-in?",
    answer:
      "Gmail access is what lets Irene start reading the emails for financial data and building the picture immediately.",
  },
  {
    question: "What happens after entry?",
    answer:
      "You land in a quiet dashboard focused on the current money picture, open review items, and recurring signals.",
  },
] as const

export default async function Page() {
  const session = await getServerSession()

  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="min-h-svh bg-[var(--neo-black)] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-16 pt-5 md:px-8 md:pb-24 md:pt-6">
        <header className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
          <p className="neo-kicker text-white/66">Irene</p>
          <Link
            href="/sign-in"
            className="cursor-pointer text-[0.72rem] font-semibold tracking-[0.22em] text-white/54 uppercase transition hover:text-white"
          >
            Sign in
          </Link>
        </header>

        <section className="pb-14 pt-12 lg:pb-20 lg:pt-20">
          <div className="max-w-3xl">
            <p className="text-[0.72rem] font-medium tracking-[0.16em] text-white/42 uppercase">
              Money clarity from email
            </p>
            <h1 className="mt-2 max-w-[13ch] font-display text-[2.95rem] leading-[0.94] text-white md:text-[4.9rem]">
              a quieter way
              <br />
              to read your
              <br />
              money trail.
            </h1>
            <p className="mt-6 max-w-[42rem] text-[0.98rem] leading-7 text-white/58 md:text-[1.02rem]">
              Irene turns receipts, bank alerts, subscription notices, and obligation
              reminders into one readable ledger, so decisions start from evidence instead
              of inbox archaeology.
            </p>

            <div className="mt-8 max-w-sm">
              <SignInButton />
            </div>
          </div>
        </section>

        <section className="border-t border-white/8 py-10 md:py-14">
          <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
            <p className="neo-kicker text-white/52">What stays in view</p>
            <div className="space-y-6">
              {principles.map((principle, index) => (
                <div
                  key={principle}
                  className="grid gap-3 border-b border-white/8 pb-6 last:border-b-0 last:pb-0 md:grid-cols-[44px_minmax(0,1fr)]"
                >
                  <p className="font-display text-[1.4rem] leading-none text-white/24">
                    0{index + 1}
                  </p>
                  <p className="max-w-[48rem] text-[0.95rem] leading-7 text-white/58 md:text-[1rem]">
                    {principle}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/8 py-10 md:py-14">
          <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)]">
            <p className="neo-kicker text-white/52">Questions</p>
            <div className="space-y-7">
              {faqs.map((item) => (
                <div key={item.question} className="max-w-3xl">
                  <h2 className="font-display text-[1.55rem] leading-[1.02] text-white md:text-[1.8rem]">
                    {item.question}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-white/56 md:text-[0.96rem]">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/8 py-10 md:py-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-2xl">
              <p className="neo-kicker text-white/52">Owner sign-in</p>
              <h2 className="mt-4 max-w-[12ch] font-display text-[2.15rem] leading-[0.96] text-white md:text-[3rem]">
                enter a clearer
                <br />
                money picture.
              </h2>
              <p className="mt-4 max-w-xl text-sm text-white/56">
                Irene is intentionally narrow, and evidence-backed from the first
                screen onward.
              </p>
            </div>

            <div className="w-full max-w-sm lg:min-w-[18rem]">
              <SignInButton />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
