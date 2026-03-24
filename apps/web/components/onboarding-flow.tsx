"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import onboardingFinishImage from "@workspace/assets/images/onboarding-finish.png"
import onboardingHeroImage from "@workspace/assets/images/onboarding-hero.png"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import {
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiLoader4Line,
} from "@remixicon/react"

type OnboardingFlowProps = {
  initialTimeZone: string
  initialCurrency: string
  timeZoneOptions: string[]
  currencyOptions: string[]
}

const CURRENCY_LABELS: Record<string, string> = {
  INR: "Indian Rupees (INR)",
  USD: "US Dollars (USD)",
  EUR: "Euros (EUR)",
  GBP: "British Pounds (GBP)",
  AED: "UAE Dirham (AED)",
  SGD: "Singapore Dollars (SGD)",
}

function formatUtcOffset(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(new Date())
  const rawLabel =
    parts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC") ??
    "UTC"

  if (rawLabel === "UTC") {
    return "UTC +00:00"
  }

  const compact = rawLabel.replace("UTC", "").trim()
  const sign = compact.startsWith("-") ? "-" : "+"
  const [hoursPart = "0", minutesPart = "00"] = compact.replace(/^[-+]/, "").split(":")
  const hours = hoursPart.padStart(2, "0")
  const minutes = minutesPart.padStart(2, "0")

  return `UTC ${sign}${hours}:${minutes}`
}

function formatTimeZoneLabel(timeZone: string) {
  return `${formatUtcOffset(timeZone)}, ${timeZone}`
}

function formatCurrencyLabel(currency: string) {
  return CURRENCY_LABELS[currency] ?? currency
}

function OnboardingSelectField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium tracking-[-0.025em] text-black">
        {props.label}
      </span>
      <div className="relative">
        <Input
          readOnly
          value={props.options.find((option) => option.value === props.value)?.label ?? props.value}
          className="pointer-events-none h-[3rem] border-black/14 bg-transparent px-5 pr-15 text-[0.94rem] font-medium text-black shadow-none focus:border-black/14 focus:bg-transparent"
        />
        <RiArrowDownSLine className="pointer-events-none absolute top-1/2 right-5 size-7 -translate-y-1/2 text-black/18" />
        <select
          aria-label={props.label}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        >
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}

export function OnboardingFlow({
  initialTimeZone,
  initialCurrency,
  timeZoneOptions,
  currencyOptions,
}: OnboardingFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [timeZone, setTimeZone] = useState(initialTimeZone)
  const [currency, setCurrency] = useState(initialCurrency)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const timeZoneChoices = timeZoneOptions.map((option) => ({
    value: option,
    label: formatTimeZoneLabel(option),
  }))
  const currencyChoices = currencyOptions.map((option) => ({
    value: option,
    label: formatCurrencyLabel(option),
  }))

  function handleComplete() {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            reportingCurrency: currency,
            timeZone,
          }),
        })

        const payload = (await response.json().catch(() => null)) as { error?: string } | null

        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to finish onboarding.")
        }

        setStep(2)
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to finish onboarding.")
      }
    })
  }

  if (step === 0) {
    return (
      <main className="relative min-h-svh overflow-hidden bg-[#08080A] text-white">
        <div className="relative mx-auto flex min-h-svh w-full flex-col px-7 pt-14 pb-10">
          <div className="flex flex-1 items-end justify-center pt-8 pb-10">
            <Image
              src={onboardingHeroImage}
              alt="Irene inbox intelligence"
              priority
              className="h-auto scale-110 w-full max-w-none translate-x-1 object-contain"
            />
          </div>

          <div className="pb-6">
            <p className="text-[0.7rem] tracking-[0.3em] text-white/42 uppercase">
              Welcome to Irene
            </p>
            <h1 className="mt-2 font-display text-[2.5rem] leading-[0.94] tracking-[-0.045em] whitespace-pre-line text-white">
              understand &amp; plan{"\n"}your money
            </h1>
            <Button
              variant="onboardingLight"
              size="lg"
              className="mt-8 h-[3rem] w-fit min-w-[8.4rem] px-[1rem] text-[0.96rem] font-semibold tracking-[-0.03em]"
              onClick={() => setStep(1)}
            >
              Let’s go
              <RiArrowRightLine className="size-[1.35rem]" />
            </Button>
          </div>
        </div>
      </main>
    )
  }

  if (step === 2) {
    return (
      <main className="relative min-h-svh overflow-hidden bg-[#06070a] text-white">
        <div className="relative mx-auto flex min-h-svh w-full max-w-[28rem] flex-col px-7 pt-14 pb-24">
          <button
            type="button"
            className="w-fit text-white transition-opacity hover:opacity-72"
            onClick={() => router.push("/dashboard")}
          >
            <RiArrowLeftLine className="size-8" />
          </button>

          <div className="pt-[4.5rem]">
            <p className="text-[0.76rem] tracking-[0.3em] text-white/42 uppercase">
              Let’s get you in
            </p>
            <h1 className="mt-5 max-w-[10ch] font-display text-[3.35rem] leading-[0.96] tracking-[-0.045em] text-white">
              You are all set to manage your money
            </h1>
          </div>

          <div className="flex flex-1 items-center justify-center py-12">
            <Image
              src={onboardingFinishImage}
              alt="Irene connected"
              priority
              className="h-auto w-[20.5rem] object-contain"
            />
          </div>

          <Button
            variant="onboardingLight"
            size="lg"
            className="h-[4.25rem] w-full text-[0.98rem] font-semibold tracking-[-0.03em]"
            onClick={() => router.push("/dashboard")}
          >
            Super! Let’s go
          </Button>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-10 bg-[#16c86a] px-6 py-4 text-center text-[0.92rem] tracking-[0.02em] text-white uppercase">
          We’re running backfill from your emails
        </div>
      </main>
    )
  }

  return (
    <main className="flex h-svh flex-col bg-white text-black">
      <div className="mx-auto flex w-full max-w-[28rem] basis-[30%] flex-col bg-[#06070a] px-7 pt-12 pb-10 text-white">
        <button
          type="button"
          className="w-fit text-white transition-opacity hover:opacity-72"
          onClick={() => setStep(0)}
        >
          <RiArrowLeftLine className="size-8" />
        </button>

        <div className="mt-6">
          <p className="text-[0.74rem] tracking-[0.28em] text-white/42 uppercase">
            Welcome to Irene
          </p>
          <h1 className="mt-2 font-display text-[2.85rem] leading-[0.92] tracking-[-0.045em] text-white">
            understand &amp; plan
            <br />
            your money
          </h1>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[28rem] basis-[70%] flex-col px-7 py-7">
        <div className="grid gap-6">
          <OnboardingSelectField
            label="choose your preferred timezone"
            value={timeZone}
            onChange={setTimeZone}
            options={timeZoneChoices}
          />

          <OnboardingSelectField
            label="choose your preferred currency"
            value={currency}
            onChange={setCurrency}
            options={currencyChoices}
          />
        </div>

        <div className="mt-auto pt-14">
          {error ? (
            <p className="mb-4 text-sm leading-6 text-[#bd2d2d]">{error}</p>
          ) : null}

          <Button
            variant="onboardingDark"
            size="lg"
            disabled={isPending}
            className={cn(
              "h-[3.7rem] w-fit min-w-[8.4rem] px-[1.15rem] text-[0.96rem] font-semibold tracking-[-0.03em]",
              isPending && "opacity-80",
            )}
            onClick={handleComplete}
          >
            {isPending ? (
              <>
                <RiLoader4Line className="size-6 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                Let’s go
                <RiArrowRightLine className="size-[1.35rem]" />
              </>
            )}
          </Button>
        </div>
      </div>
    </main>
  )
}
