import { redirect } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

import { SignInButton } from "@/components/sign-in-button"
import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const session = await getServerSession()

  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-5 py-12 text-white">
      <div className="relative z-10 grid w-full max-w-5xl gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <Card className="p-6 md:p-8">
          <p className="neo-kicker">Irene</p>
          <h1 className="mt-4 max-w-[10ch] font-display text-[3.3rem] leading-[0.9] text-white md:text-[4.6rem]">
            one place
            <br />
            for your
            <br />
            money trail.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-white/58">
            Irene reads your inbox, builds a canonical ledger, and helps you decide
            what is real, what is recurring, and what needs your attention.
          </p>

          <div className="mt-8 grid gap-3">
            <FeatureStrip title="Evidence-backed" description="Receipts, alerts, subscriptions, and obligations stay traceable to source." />
            <FeatureStrip title="Private by design" description="Single-owner access, Gmail-bound identity, and no generic public signup flow." />
            <FeatureStrip title="Mobile first" description="Built like a finance app, not an internal dashboard." />
          </div>
        </Card>

        <Card variant="spotlight" className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="neo-kicker text-white/72">Owner access</p>
              <h2 className="mt-4 font-display text-[2.8rem] leading-[0.92] text-white md:text-[3.6rem]">
                sign in to
                <br />
                continue.
              </h2>
            </div>
            <Badge variant="cream">Private</Badge>
          </div>

          <div className="mt-8 border border-white/16 bg-black/10 p-5">
            <p className="neo-kicker text-white/72">Access rule</p>
            <p className="mt-3 text-sm leading-6 text-white/74">
              Only allowlisted Google accounts can enter Irene. The Gmail inbox you
              connect later must match the owner account you use here.
            </p>
          </div>

          <div className="mt-8">
            <SignInButton />
          </div>
        </Card>
      </div>
    </main>
  )
}

function FeatureStrip(props: { title: string; description: string }) {
  return (
    <div className="border border-white/8 bg-black/20 p-4">
      <p className="neo-kicker">{props.title}</p>
      <p className="mt-3 text-sm leading-6 text-white/62">{props.description}</p>
    </div>
  )
}
