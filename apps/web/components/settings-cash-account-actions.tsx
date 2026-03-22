"use client"

import { RiArrowRightSLine } from "@remixicon/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"

import { settingsRowClassName } from "@/components/settings-accounts-shared"

type CashAccount = {
  id: string
  displayName: string
  instrumentLabel: string
  sourceLabel: string
  sourceMetaLabel: string
  currencyLabel: string
  instrumentType: string
  status: string
  creditLimitMinor: number | null
  redirectTo: string
}

export function SettingsCashAccountActions({
  accounts,
}: {
  accounts: CashAccount[]
}) {
  return (
    <div className="divide-y divide-white/[0.06]">
      {accounts.map((account) => (
        <Sheet key={account.id}>
          <SheetTrigger asChild>
            <button className={settingsRowClassName}>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-white">{account.displayName}</p>
                <p className="mt-1 text-sm text-white/28">{account.instrumentLabel}</p>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <span className="text-[15px] text-white/36">{account.sourceLabel}</span>
                <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
              </div>
            </button>
          </SheetTrigger>

          <SheetContent>
            <SheetHeader>
              <SheetTitle>cash account</SheetTitle>
              <SheetDescription>{account.displayName}</SheetDescription>
            </SheetHeader>

            <div className="grid gap-4 px-6 pb-10 pt-5">
              <div className="border border-white/[0.06] px-4 py-4">
                <p className="text-[15px] text-white">{account.sourceLabel}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/32">
                  {account.sourceMetaLabel}
                </p>
              </div>

              <div className="border border-white/[0.06] px-4 py-4">
                <p className="text-[15px] text-white">reporting currency</p>
                <p className="mt-1 text-sm leading-relaxed text-white/32">
                  {account.currencyLabel}
                </p>
              </div>

              <form
                action="/api/settings/payment-instrument/update"
                method="post"
                className="grid gap-4 border border-white/[0.06] px-4 py-4"
              >
                <input type="hidden" name="paymentInstrumentId" value={account.id} />
                <input type="hidden" name="redirectTo" value={account.redirectTo} />
                <label className="grid gap-2 text-sm font-medium text-white">
                  <span>display name</span>
                  <Input name="displayName" defaultValue={account.displayName} />
                </label>
                <label className="grid gap-2 text-sm font-medium text-white">
                  <span>instrument type</span>
                  <select
                    name="instrumentType"
                    defaultValue={account.instrumentType}
                    className="h-12 w-full border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm text-[var(--neo-cream)] outline-none"
                  >
                    <option value="bank_account">bank account</option>
                    <option value="wallet">wallet</option>
                    <option value="debit_card">debit card</option>
                    <option value="upi">upi</option>
                    <option value="unknown">unknown</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium text-white">
                  <span>status</span>
                  <select
                    name="status"
                    defaultValue={account.status}
                    className="h-12 w-full border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 text-sm text-[var(--neo-cream)] outline-none"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
                <Button type="submit">Save account</Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      ))}

      <AddCashAccountAction />
    </div>
  )
}

function AddCashAccountAction() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className={settingsRowClassName}>
          <span className="text-[15px] text-white">add cash account</span>
          <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
        </button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>add cash account</SheetTitle>
          <SheetDescription>
            Create a bank account or wallet identity when inbox evidence has not inferred one yet.
          </SheetDescription>
        </SheetHeader>

        <form action="/api/settings/accounts/create" method="post" className="grid gap-4 px-6 pb-10 pt-5">
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>account name</span>
            <Input name="displayName" placeholder="HDFC salary account" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>last 4 digits</span>
            <Input
              name="maskedIdentifier"
              inputMode="numeric"
              maxLength={4}
              placeholder="Optional"
            />
          </label>
          <Button type="submit">Add account</Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
