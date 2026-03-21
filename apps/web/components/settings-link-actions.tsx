"use client"

import { RiArrowRightSLine } from "@remixicon/react"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"

import { settingsRowClassName } from "@/components/settings-accounts-shared"

type CashAccountOption = {
  id: string
  displayName: string
}

type LinkedInstrument = {
  id: string
  displayName: string
  instrumentLabel: string
  backingPaymentInstrumentId: string | null
  backingLabel: string
}

export function SettingsLinkActions({
  instruments,
  cashAccounts,
}: {
  instruments: LinkedInstrument[]
  cashAccounts: CashAccountOption[]
}) {
  return (
    <div className="divide-y divide-white/[0.06]">
      {instruments.map((instrument) => (
        <Sheet key={instrument.id}>
          <SheetTrigger asChild>
            <button className={settingsRowClassName}>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-white">{instrument.displayName}</p>
                <p className="mt-1 text-sm text-white/28">{instrument.instrumentLabel}</p>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <span className="text-[15px] text-white/36">{instrument.backingLabel}</span>
                <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
              </div>
            </button>
          </SheetTrigger>

          <SheetContent>
            <SheetHeader>
              <SheetTitle>linked instrument</SheetTitle>
              <SheetDescription>{instrument.displayName}</SheetDescription>
            </SheetHeader>

            <form
              action="/api/settings/payment-instrument/link-backing"
              method="post"
              className="grid gap-4 px-6 pb-10 pt-5"
            >
              <input type="hidden" name="paymentInstrumentId" value={instrument.id} />
              <p className="text-sm leading-relaxed text-white/40">
                Choose the cash account this instrument should roll up into for forecasting.
              </p>

              <select
                name="backingPaymentInstrumentId"
                defaultValue={instrument.backingPaymentInstrumentId ?? ""}
                className="h-12 w-full border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm text-[var(--neo-cream)] outline-none"
              >
                <option value="">No linked cash account</option>
                {cashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName}
                  </option>
                ))}
              </select>

              <Button type="submit">Save link</Button>
            </form>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  )
}
