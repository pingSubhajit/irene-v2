import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

import { SignInButton } from "@/components/sign-in-button"
import { getServerSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Irene | Calm money clarity from your inbox",
  description:
    "Irene turns receipts, bank alerts, subscriptions, and obligation emails into one calm ledger with recurring clarity and evidence-backed review.",
}

const trustPoints = [
  {
    title: "Single-owner access",
    description:
      "Irene stays private by default, with allowlisted Google access instead of an open public signup.",
  },
  {
    title: "Evidence-backed ledger",
    description:
      "Every decision starts from real receipts, bank alerts, subscription notices, and merchant emails.",
  },
  {
    title: "Built for review",
    description:
      "The product surfaces what needs confirmation instead of hiding uncertainty behind a polished guess.",
  },
] as const

const valueCards = [
  {
    eyebrow: "01",
    title: "One timeline instead of scattered proof",
    description:
      "Inbox documents resolve into a single readable money trail so purchases, refunds, subscriptions, and obligations stop competing for context.",
  },
  {
    eyebrow: "02",
    title: "Recurring commitments show up early",
    description:
      "Irene spots the charges and reminders that repeat, then keeps them visible before they fade back into inbox clutter.",
  },
  {
    eyebrow: "03",
    title: "Corrections stay grounded in source",
    description:
      "When something looks uncertain, the review flow keeps the original evidence close so you can confirm the right canonical event quickly.",
  },
] as const

const faqItems = [
  {
    question: "Who is Irene for?",
    answer:
      "People whose money trail largely lives in email: card alerts, payment receipts, subscriptions, invoices, refund confirmations, and reminder notices.",
  },
  {
    question: "Does Irene move money or connect to my bank?",
    answer:
      "No. Irene reads financial evidence from your inbox and builds a ledger around it. It is designed for clarity and review, not payment execution.",
  },
  {
    question: "Why does it use Google sign-in?",
    answer:
      "Access is restricted to allowlisted Google accounts, and Gmail access is what lets Irene start building the money picture immediately after entry.",
  },
  {
    question: "What happens after I enter?",
    answer:
      "You land in a quiet dashboard that starts with the current picture, open review items, and recurring signals instead of an undifferentiated inbox dump.",
  },
] as const

export default async function Page() {
  const session = await getServerSession()

  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-[var(--neo-black)] text-white">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,239,229,0.08),transparent_26%),radial-gradient(circle_at_78%_18%,rgba(87,126,255,0.18),transparent_24%),radial-gradient(circle_at_60%_72%,rgba(255,231,90,0.08),transparent_24%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-position:center_center] [background-size:140px_140px]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-5 pb-16 pt-6 md:px-8 md:pb-24 md:pt-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-3 rounded-full bg-[var(--neo-yellow)] shadow-[0_0_22px_rgba(255,231,90,0.6)]" />
            <p className="neo-kicker text-white/72">Irene</p>
          </div>
          <Link
            href="/sign-in"
            className="text-sm font-semibold tracking-[0.16em] text-white/58 uppercase transition hover:text-white"
          >
            Owner access
          </Link>
        </header>

        <section className="grid gap-10 pb-16 pt-12 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:pb-20 lg:pt-20">
          <div className="max-w-3xl">
            <Badge variant="default" className="border-white/12 bg-white/6 text-white/72">
              Inbox-native money clarity
            </Badge>
            <h1 className="mt-6 max-w-[12ch] font-display text-[3.5rem] leading-[0.9] text-white md:text-[5.8rem]">
              for money trails
              <br />
              trapped in email,
              <br />
              one calm ledger.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/62 md:text-lg">
              Irene turns receipts, bank alerts, subscription notices, and obligation
              reminders into a single readable view, so the next decision starts from
              evidence instead of inbox archaeology.
            </p>

            <div className="mt-9 flex max-w-sm flex-col gap-4">
              <SignInButton />
              <p className="text-sm leading-6 text-white/46">
                Private entry only. Allowlisted Google accounts start on the owner sign-in flow
                and route straight into onboarding.
              </p>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              <SignalChip label="Receipts" />
              <SignalChip label="Bank alerts" />
              <SignalChip label="Recurring notices" />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
            <div
              aria-hidden="true"
              className="absolute left-[12%] top-[8%] size-28 rounded-full bg-[rgba(87,126,255,0.25)] blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-[6%] right-[6%] size-24 rounded-full bg-[rgba(255,231,90,0.18)] blur-3xl"
            />

            <Card className="neo-panel p-6 md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="neo-kicker text-white/66">Sample snapshot</p>
                  <h2 className="mt-4 max-w-[12ch] font-display text-[2.6rem] leading-[0.94] text-white md:text-[3.3rem]">
                    a dashboard
                    <br />
                    that feels
                    <br />
                    quieter.
                  </h2>
                </div>
                <Badge variant="cream">Private</Badge>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="border border-white/10 bg-[rgba(255,255,255,0.03)] p-5">
                  <p className="neo-kicker text-white/56">Month in view</p>
                  <p className="mt-4 font-display text-[3.3rem] leading-none text-white">
                    ₹48,320
                  </p>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-white/56">
                    A readable spend total with context, not a pile of unrelated messages.
                  </p>

                  <div className="mt-6 grid gap-3">
                    <InlineMetric label="Recurring signals" value="4 active" />
                    <InlineMetric label="Open review" value="2 items" />
                    <InlineMetric label="Latest source" value="Receipt + bank alert" />
                  </div>
                </div>

                <div className="grid gap-4">
                  <Card variant="spotlight" className="p-5">
                    <p className="neo-kicker text-white/72">Recurring clarity</p>
                    <p className="mt-4 font-display text-[2rem] leading-none text-white">
                      due before
                      <br />
                      surprise.
                    </p>
                  </Card>

                  <Card variant="cream" className="p-5">
                    <p className="neo-kicker text-black/54">Review flow</p>
                    <p className="mt-4 max-w-[14ch] font-display text-[2rem] leading-[0.94] text-[var(--neo-black)]">
                      source stays close to the decision.
                    </p>
                  </Card>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {trustPoints.map((point) => (
            <Card key={point.title} className="neo-panel p-5 md:p-6">
              <p className="neo-kicker">{point.title}</p>
              <p className="mt-4 text-sm leading-6 text-white/60">{point.description}</p>
            </Card>
          ))}
        </section>

        <section className="grid gap-8 py-16 lg:grid-cols-[0.82fr_1.18fr] lg:py-24">
          <div className="max-w-xl">
            <p className="neo-kicker">What Irene keeps in view</p>
            <h2 className="mt-5 max-w-[11ch] font-display text-[2.8rem] leading-[0.94] text-white md:text-[4rem]">
              less searching,
              <br />
              less stitching,
              <br />
              less doubt.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-white/58 md:text-base">
              The landing page goal is simple: show a product that feels composed,
              evidence-backed, and intentionally narrow. Irene is not another noisy finance
              dashboard. It is a calmer surface over the signals you already receive.
            </p>
          </div>

          <div className="grid gap-4">
            {valueCards.map((card, index) => (
              <Card
                key={card.title}
                className={
                  index === 1
                    ? "neo-panel border-[rgba(255,231,90,0.14)] bg-[rgba(255,231,90,0.04)] p-6"
                    : "neo-panel p-6"
                }
              >
                <div className="grid gap-4 md:grid-cols-[96px_1fr] md:items-start">
                  <p className="font-display text-[2.2rem] leading-none text-white/28">
                    {card.eyebrow}
                  </p>
                  <div>
                    <h3 className="max-w-[20ch] font-display text-[2rem] leading-[0.96] text-white">
                      {card.title}
                    </h3>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60 md:text-base">
                      {card.description}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <Card className="neo-panel p-6 md:p-8">
            <p className="neo-kicker">Flow</p>
            <h2 className="mt-4 max-w-[12ch] font-display text-[2.6rem] leading-[0.94] text-white md:text-[3.5rem]">
              five calm moves
              <br />
              from inbox to clarity.
            </h2>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <FlowTile
                step="01"
                title="Stop the scroll"
                description="The hero leads with one promise: turn inbox-based money evidence into one quiet ledger."
              />
              <FlowTile
                step="02"
                title="Earn trust"
                description="Private access, evidence-backed tracing, and review-first language show restraint early."
              />
              <FlowTile
                step="03"
                title="Explain value"
                description="The page focuses on timeline clarity, recurring visibility, and reviewable corrections."
              />
              <FlowTile
                step="04"
                title="Remove doubt"
                description="FAQ answers the real questions about bank access, privacy, and what the product actually does."
              />
            </div>
          </Card>

          <Card variant="spotlight" className="p-6 md:p-8">
            <p className="neo-kicker text-white/72">Primary ask</p>
            <h2 className="mt-4 max-w-[11ch] font-display text-[2.8rem] leading-[0.92] text-white md:text-[3.7rem]">
              one action,
              <br />
              no detours.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/76">
              The page stays focused on a single route forward: owner sign-in with Google.
              No pricing maze, no feature sprawl, no second conversion path.
            </p>

            <div className="mt-8 border border-white/16 bg-black/10 p-5">
              <p className="neo-kicker text-white/72">CTA</p>
              <p className="mt-3 text-sm leading-7 text-white/76">
                Continue with Google
              </p>
            </div>

            <div className="mt-8">
              <SignInButton />
            </div>
          </Card>
        </section>

        <section className="py-16 lg:py-24">
          <div className="max-w-2xl">
            <p className="neo-kicker">Questions</p>
            <h2 className="mt-5 max-w-[12ch] font-display text-[2.8rem] leading-[0.94] text-white md:text-[4rem]">
              the objections
              <br />
              that matter.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {faqItems.map((item) => (
              <Card key={item.question} className="neo-panel p-6">
                <h3 className="max-w-[18ch] font-display text-[1.85rem] leading-[0.98] text-white">
                  {item.question}
                </h3>
                <p className="mt-4 text-sm leading-7 text-white/60 md:text-base">
                  {item.answer}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card className="neo-panel relative overflow-hidden p-6 md:p-8">
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(244,239,229,0.12),transparent_58%)]"
            />
            <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="max-w-2xl">
                <p className="neo-kicker">Owner sign-in</p>
                <h2 className="mt-5 max-w-[11ch] font-display text-[2.9rem] leading-[0.92] text-white md:text-[4.4rem]">
                  step into a clearer money picture.
                </h2>
                <p className="mt-5 max-w-xl text-sm leading-7 text-white/60 md:text-base">
                  Irene is designed to feel composed from the first screen onward. If you
                  already have access, continue with Google and let the app take over from
                  there.
                </p>
              </div>

              <div className="w-full max-w-sm">
                <SignInButton />
                <Link
                  href="/sign-in"
                  className="mt-5 inline-flex cursor-pointer text-sm font-semibold tracking-[0.16em] text-white/58 uppercase transition hover:text-white"
                >
                  Open dedicated sign-in page
                </Link>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  )
}

function SignalChip(props: { label: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="neo-kicker">{props.label}</p>
    </div>
  )
}

function InlineMetric(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3">
      <p className="text-sm text-white/54">{props.label}</p>
      <p className="text-sm font-semibold text-white">{props.value}</p>
    </div>
  )
}

function FlowTile(props: { step: string; title: string; description: string }) {
  return (
    <div className="border border-white/10 bg-[rgba(255,255,255,0.03)] p-5">
      <p className="neo-kicker">{props.step}</p>
      <h3 className="mt-3 font-display text-[1.8rem] leading-[0.98] text-white">
        {props.title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-white/58">{props.description}</p>
    </div>
  )
}
