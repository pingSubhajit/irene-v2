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

type BaselineAccount = {
  id: string
  displayName: string
  instrumentLabel: string
  anchorAmountLabel: string
  anchorStateLabel: string
  anchorMetaLabel: string
  currency: string
  suggestionId: string | null
  suggestionAmountLabel: string | null
  suggestionSeenLabel: string | null
  redirectTo: string
}

export function SettingsBaselineActions({
  accounts,
}: {
  accounts: BaselineAccount[]
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
                <span className="text-[15px] text-white/36">{account.anchorAmountLabel}</span>
                <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
              </div>
            </button>
          </SheetTrigger>

          <SheetContent>
            <SheetHeader>
              <SheetTitle>forecast baseline</SheetTitle>
              <SheetDescription>{account.displayName}</SheetDescription>
            </SheetHeader>

            <div className="grid gap-4 px-6 pb-10 pt-5">
              <div className="border border-white/[0.06] px-4 py-4">
                <p className="text-[15px] text-white">{account.anchorStateLabel}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/32">
                  {account.anchorMetaLabel}
                </p>
              </div>

              {account.suggestionId && account.suggestionAmountLabel && account.suggestionSeenLabel ? (
                <div className="border border-white/[0.06] px-4 py-4">
                  <p className="text-[15px] text-white">latest inbox balance</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/32">
                    {account.suggestionAmountLabel} · seen {account.suggestionSeenLabel}
                  </p>

                  <form action="/api/settings/balance-anchor/from-observation" method="post" className="mt-4">
                    <input type="hidden" name="observationId" value={account.suggestionId} />
                    <input type="hidden" name="redirectTo" value={account.redirectTo} />
                    <div className="flex gap-3">
                      <Button type="submit" size="sm">
                        Use this
                      </Button>
                    </div>
                  </form>

                  <form action="/api/settings/balance-observation" method="post" className="mt-3">
                    <input type="hidden" name="observationId" value={account.suggestionId} />
                    <input type="hidden" name="status" value="ignored" />
                    <input type="hidden" name="redirectTo" value={account.redirectTo} />
                    <Button type="submit" size="sm" variant="secondary">
                      Ignore suggestion
                    </Button>
                  </form>
                </div>
              ) : null}

              <form action="/api/settings/balance-anchor" method="post" className="grid gap-3">
                <input type="hidden" name="paymentInstrumentId" value={account.id} />
                <input type="hidden" name="currency" value={account.currency} />
                <label className="grid gap-2 text-sm font-medium text-white">
                  <span>current balance</span>
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Set current balance"
                  />
                </label>
                <Button type="submit">Save balance</Button>
              </form>

              <form action="/api/settings/balance-anchor/delete" method="post">
                <input type="hidden" name="paymentInstrumentId" value={account.id} />
                <Button type="submit" variant="secondary">
                  Remove anchor
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  )
}
