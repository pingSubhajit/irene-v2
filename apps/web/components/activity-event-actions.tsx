"use client"

import { RiArrowDownSLine, RiArrowRightSLine, RiMore2Fill } from "@remixicon/react"
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

type EventOption = {
  id: string
  displayName: string
  subtitle?: string | null
}

type EventActionProps = {
  redirectTo: string
  event: {
    id: string
    status: "confirmed" | "needs_review" | "ignored" | "reversed"
    amountMinor: number
    eventType: string
    merchantId: string | null
    categoryId: string | null
    paymentInstrumentId: string | null
    description: string | null
    notes: string | null
  }
  merchant: {
    id: string
    displayName: string
    defaultCategory: string | null
  } | null
  paymentInstrument: {
    id: string
    displayName: string
    instrumentType: string
    status: string
    creditLimitMinor: number | null
  } | null
  merchants: EventOption[]
  categories: EventOption[]
  paymentInstruments: EventOption[]
}

const rowClassName =
  "flex w-full items-center justify-between py-4 text-left transition hover:bg-white/[0.02]"

function formatMajorAmount(amountMinor: number | null | undefined) {
  if (typeof amountMinor !== "number") return ""
  return (amountMinor / 100).toFixed(2)
}

export function ActivityEventActions({
  redirectTo,
  event,
  merchant,
  paymentInstrument,
  merchants,
  categories,
  paymentInstruments,
}: EventActionProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Manage transaction"
          className="size-10 rounded-none border-transparent text-white/52 hover:border-white/8 hover:bg-white/[0.04] hover:text-white"
        >
          <RiMore2Fill className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>manage</SheetTitle>
          <SheetDescription>Correct canonical finance state without changing the original evidence.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 px-6 pb-10 pt-5">
          <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            <EventEditSheet
              redirectTo={redirectTo}
              event={event}
              merchants={merchants}
              categories={categories}
              paymentInstruments={paymentInstruments}
            />
            {merchant ? (
              <MerchantEditSheet
                redirectTo={redirectTo}
                merchant={merchant}
                merchants={merchants}
                categories={categories}
              />
            ) : null}
            {paymentInstrument ? (
              <InstrumentEditSheet
                redirectTo={redirectTo}
                paymentInstrument={paymentInstrument}
              />
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EventEditSheet({
  redirectTo,
  event,
  merchants,
  categories,
  paymentInstruments,
}: {
  redirectTo: string
  event: EventActionProps["event"]
  merchants: EventOption[]
  categories: EventOption[]
  paymentInstruments: EventOption[]
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className={rowClassName}>
          <div>
            <p className="text-[15px] text-white">event details</p>
            <p className="mt-1 text-sm text-white/28">merchant, category, instrument, type, notes</p>
          </div>
          <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
        </button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>edit event</SheetTitle>
          <SheetDescription>Correct the canonical event without touching the original evidence.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-6 pb-10 pt-5">
          <form action="/api/activity/event" method="post" className="grid gap-4">
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="mode" value="update" />

            <SelectField
              label="merchant"
              name="merchantId"
              defaultValue={event.merchantId ?? ""}
              options={merchants}
              emptyLabel="No linked merchant"
            />
            <SelectField
              label="category"
              name="categoryId"
              defaultValue={event.categoryId ?? ""}
              options={categories}
              emptyLabel="No category"
            />
            <SelectField
              label="instrument"
              name="paymentInstrumentId"
              defaultValue={event.paymentInstrumentId ?? ""}
              options={paymentInstruments}
              emptyLabel="No linked instrument"
            />
            <SelectField
              label="event type"
              name="eventType"
              defaultValue={event.eventType}
              options={[
                { id: "purchase", displayName: "purchase" },
                { id: "income", displayName: "income" },
                { id: "subscription_charge", displayName: "subscription charge" },
                { id: "emi_payment", displayName: "emi payment" },
                { id: "bill_payment", displayName: "bill payment" },
                { id: "refund", displayName: "refund" },
                { id: "transfer", displayName: "transfer" },
              ]}
            />
            <label className="grid gap-2 text-sm font-medium text-white">
              <span>amount</span>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={formatMajorAmount(event.amountMinor)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-white">
              <span>description</span>
              <Input name="description" defaultValue={event.description ?? ""} placeholder="Optional" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-white">
              <span>notes</span>
              <Input name="notes" defaultValue={event.notes ?? ""} placeholder="Optional note" />
            </label>
            <Button type="submit">Save event</Button>
          </form>

          <form action="/api/activity/event" method="post">
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <input type="hidden" name="mode" value={event.status === "ignored" ? "restore" : "ignore"} />
            <Button
              type="submit"
              variant="link"
              className={
                event.status === "ignored"
                  ? "w-full justify-center text-white/70 hover:text-white hover:no-underline"
                  : "w-full justify-center text-[var(--neo-coral)] hover:text-[var(--neo-coral)] hover:no-underline"
              }
            >
              {event.status === "ignored" ? "Restore event" : "Ignore event"}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MerchantEditSheet({
  redirectTo,
  merchant,
  merchants,
  categories,
}: {
  redirectTo: string
  merchant: NonNullable<EventActionProps["merchant"]>
  merchants: EventOption[]
  categories: EventOption[]
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className={rowClassName}>
          <div>
            <p className="text-[15px] text-white">merchant</p>
            <p className="mt-1 text-sm text-white/28">rename, change default category, or merge</p>
          </div>
          <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
        </button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>manage merchant</SheetTitle>
          <SheetDescription>{merchant.displayName}</SheetDescription>
        </SheetHeader>

        <form action="/api/activity/merchant" method="post" className="grid gap-4 px-6 pb-10 pt-5">
          <input type="hidden" name="merchantId" value={merchant.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <label className="grid gap-2 text-sm font-medium text-white">
            <span>display name</span>
            <Input name="displayName" defaultValue={merchant.displayName} />
          </label>
          <SelectField
            label="default category"
            name="defaultCategoryId"
            defaultValue={merchant.defaultCategory ?? ""}
            options={categories}
            emptyLabel="No default category"
          />
          <SelectField
            label="merge into"
            name="mergeIntoMerchantId"
            defaultValue=""
            options={merchants.filter((option) => option.id !== merchant.id)}
            emptyLabel="Do not merge"
          />
          <Button type="submit">Save merchant</Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function InstrumentEditSheet({
  redirectTo,
  paymentInstrument,
}: {
  redirectTo: string
  paymentInstrument: NonNullable<EventActionProps["paymentInstrument"]>
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className={rowClassName}>
          <div>
            <p className="text-[15px] text-white">instrument</p>
            <p className="mt-1 text-sm text-white/28">rename, correct type, status, or credit limit</p>
          </div>
          <RiArrowRightSLine className="size-5 shrink-0 text-white/16" />
        </button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>manage instrument</SheetTitle>
          <SheetDescription>{paymentInstrument.displayName}</SheetDescription>
        </SheetHeader>

        <form
          action="/api/settings/payment-instrument/update"
          method="post"
          className="grid gap-4 px-6 pb-10 pt-5"
        >
          <input type="hidden" name="paymentInstrumentId" value={paymentInstrument.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <label className="grid gap-2 text-sm font-medium text-white">
            <span>display name</span>
            <Input name="displayName" defaultValue={paymentInstrument.displayName} />
          </label>
          <SelectField
            label="instrument type"
            name="instrumentType"
            defaultValue={paymentInstrument.instrumentType}
            options={[
              { id: "credit_card", displayName: "credit card" },
              { id: "debit_card", displayName: "debit card" },
              { id: "bank_account", displayName: "bank account" },
              { id: "upi", displayName: "upi" },
              { id: "wallet", displayName: "wallet" },
              { id: "unknown", displayName: "unknown" },
            ]}
          />
          <SelectField
            label="status"
            name="status"
            defaultValue={paymentInstrument.status}
            options={[
              { id: "active", displayName: "active" },
              { id: "inactive", displayName: "inactive" },
            ]}
          />
          <label className="grid gap-2 text-sm font-medium text-white">
            <span>credit limit</span>
            <Input
              name="creditLimit"
              type="number"
              step="0.01"
              min="0"
              placeholder="Optional"
              defaultValue={formatMajorAmount(paymentInstrument.creditLimitMinor)}
            />
          </label>
          <Button type="submit">Save instrument</Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  emptyLabel,
}: {
  label: string
  name: string
  defaultValue: string
  options: EventOption[]
  emptyLabel?: string
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-white">
      <span>{label}</span>
      <div className="relative">
        <select
          name={name}
          defaultValue={defaultValue}
          className="h-12 w-full appearance-none border border-white/10 bg-[rgba(20,20,22,0.92)] px-4 pr-12 text-sm text-[var(--neo-cream)] outline-none"
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName}
              {option.subtitle ? ` · ${option.subtitle}` : ""}
            </option>
          ))}
        </select>
        <RiArrowDownSLine className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-white/44" />
      </div>
    </label>
  )
}
