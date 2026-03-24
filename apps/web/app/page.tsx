import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

import { SignInButton } from "@/components/sign-in-button"
import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function Page() {
  const session = await getServerSession()

  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="relative flex min-h-svh items-center overflow-hidden px-5 py-12 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,231,90,0.12),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(87,126,255,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="flex flex-col justify-center">
          <p className="neo-kicker">Irene</p>
          <h1 className="mt-5 max-w-[11ch] font-display text-[3.4rem] leading-[0.9] text-white md:text-[5.25rem]">
            money flow,
            <br />
            without the
            <br />
            blind spots.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/64 md:text-lg">
            Irene turns inbox noise into a usable ledger, highlights recurring
            commitments, and keeps the next financial decision grounded in
            evidence.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="w-full max-w-sm">
              <SignInButton />
            </div>
            <Link
              href="/sign-in"
              className="text-sm font-semibold tracking-[0.18em] text-white/62 uppercase transition hover:text-white"
            >
              Owner sign-in page
            </Link>
          </div>
        </section>

        <section className="grid gap-4">
          <Card variant="spotlight" className="p-6 md:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="neo-kicker text-white/72">Private operator</p>
                <h2 className="mt-4 max-w-[9ch] font-display text-[2.6rem] leading-[0.92] text-white">
                  built for one calm dashboard.
                </h2>
              </div>
              <Badge variant="cream">Private</Badge>
            </div>

            <p className="mt-6 max-w-md text-sm leading-6 text-white/72">
              Access stays restricted to allowlisted Google accounts. If you
              already have access, continue with Google and Irene will route you
              into the app.
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
            <LandingFeature
              title="Inbox to ledger"
              description="Receipts, bank alerts, and merchant emails resolve into a single timeline."
            />
            <LandingFeature
              title="Recurring clarity"
              description="Subscriptions and obligations surface before they turn into surprises."
            />
            <LandingFeature
              title="Actionable review"
              description="The dashboard focuses on what needs attention instead of dumping raw data."
            />
          </div>
        </section>
      </div>
    </main>
  )
}

function LandingFeature(props: { title: string; description: string }) {
  return (
    <Card className="p-5">
      <p className="neo-kicker">{props.title}</p>
      <p className="mt-3 text-sm leading-6 text-white/62">
        {props.description}
      </p>
    </Card>
  )
}
