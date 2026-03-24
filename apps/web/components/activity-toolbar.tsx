"use client"

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiFilter3Line,
  RiSearchLine,
} from "@remixicon/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

const feedOptions = [
  { value: "all", label: "Transactions" },
  { value: "review", label: "Needs review" },
  { value: "ignored", label: "Ignored" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "emis", label: "EMIs" },
  { value: "income", label: "Income" },
] as const

const directionOptions = [
  { value: "all", label: "All directions" },
  { value: "outflow", label: "Outflows" },
  { value: "inflow", label: "Inflows" },
] as const

const sortOptions = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount_desc", label: "Highest amount" },
  { value: "amount_asc", label: "Lowest amount" },
] as const

const datePresetOptions = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
] as const

const typeOptions = [
  { value: "purchase", label: "Purchase" },
  { value: "subscription_charge", label: "Subscription" },
  { value: "emi_payment", label: "EMI payment" },
  { value: "bill_payment", label: "Bill payment" },
  { value: "income", label: "Income" },
  { value: "refund", label: "Refund" },
  { value: "transfer", label: "Transfer" },
] as const

type FeedValue = (typeof feedOptions)[number]["value"]
type DirectionValue = (typeof directionOptions)[number]["value"]
type SortValue = (typeof sortOptions)[number]["value"]
type FilterPanel =
  | "root"
  | "feed"
  | "direction"
  | "date"
  | "date_custom"
  | "category"
  | "merchant"
  | "amount"
  | "type"
  | "instrument"
  | "processor"
  | "cross_currency"
  | "sort"

type ActivityToolbarProps = {
  query?: string
  view: string
  sort: string
  reportingCurrency: string
  datePreset?: string
  dateFrom?: string
  dateTo?: string
  categories: Array<{
    slug: string
    name: string
  }>
  selectedCategories: string[]
  merchants: Array<{
    id: string
    name: string
    logoUrl: string | null
  }>
  selectedMerchants: string[]
  paymentInstruments: Array<{
    id: string
    name: string
  }>
  selectedInstruments: string[]
  paymentProcessors: Array<{
    id: string
    name: string
  }>
  selectedProcessors: string[]
  selectedTypes: string[]
  amountMin?: number
  amountMax?: number
  crossCurrency: boolean
}

function parseViewState(view: string): {
  feed: FeedValue
  direction: DirectionValue
} {
  if (view === "outflow" || view === "inflow") {
    return {
      feed: "all",
      direction: view,
    }
  }

  if (
    view === "review" ||
    view === "ignored" ||
    view === "subscriptions" ||
    view === "emis" ||
    view === "income"
  ) {
    return {
      feed: view as FeedValue,
      direction: "all",
    }
  }

  return {
    feed: "all",
    direction: "all",
  }
}

function isCanonicalView(feed: FeedValue) {
  return feed === "all" || feed === "review" || feed === "ignored"
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function countAppliedFilterGroups(input: {
  feed: FeedValue
  direction: DirectionValue
  datePreset?: string
  dateFrom?: string
  dateTo?: string
  categories: string[]
  merchants: string[]
  amountMin?: number
  amountMax?: number
  types: string[]
  instruments: string[]
  processors: string[]
  crossCurrency: boolean
}) {
  let count = 0

  if (isCanonicalView(input.feed) && input.direction !== "all") count += 1
  if (isCanonicalView(input.feed) && (input.datePreset || input.dateFrom || input.dateTo)) count += 1
  if (isCanonicalView(input.feed) && input.categories.length > 0) count += 1
  if (input.merchants.length > 0) count += 1
  if (isCanonicalView(input.feed) && (typeof input.amountMin === "number" || typeof input.amountMax === "number")) count += 1
  if (isCanonicalView(input.feed) && input.types.length > 0) count += 1
  if (isCanonicalView(input.feed) && input.instruments.length > 0) count += 1
  if (isCanonicalView(input.feed) && input.processors.length > 0) count += 1
  if (isCanonicalView(input.feed) && input.crossCurrency) count += 1

  return count
}

export function ActivityToolbar({
  query,
  view,
  sort,
  reportingCurrency,
  datePreset,
  dateFrom,
  dateTo,
  categories,
  selectedCategories,
  merchants,
  selectedMerchants,
  paymentInstruments,
  selectedInstruments,
  paymentProcessors,
  selectedProcessors,
  selectedTypes,
  amountMin,
  amountMax,
  crossCurrency,
}: ActivityToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const viewState = parseViewState(view)
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState(query ?? "")
  const [activePanel, setActivePanel] = useState<FilterPanel>("root")
  const [panelSearch, setPanelSearch] = useState("")
  const [draftFeed, setDraftFeed] = useState<FeedValue>(viewState.feed)
  const [draftDirection, setDraftDirection] = useState<DirectionValue>(viewState.direction)
  const [draftSort, setDraftSort] = useState<SortValue>((sortOptions.find((option) => option.value === sort)?.value ?? "recent"))
  const [draftDatePreset, setDraftDatePreset] = useState<string | undefined>(datePreset)
  const [draftDateFrom, setDraftDateFrom] = useState(dateFrom ?? "")
  const [draftDateTo, setDraftDateTo] = useState(dateTo ?? "")
  const [draftCategories, setDraftCategories] = useState<string[]>(selectedCategories)
  const [draftMerchants, setDraftMerchants] = useState<string[]>(selectedMerchants)
  const [draftInstruments, setDraftInstruments] = useState<string[]>(selectedInstruments)
  const [draftProcessors, setDraftProcessors] = useState<string[]>(selectedProcessors)
  const [draftTypes, setDraftTypes] = useState<string[]>(selectedTypes)
  const [draftAmountMin, setDraftAmountMin] = useState(amountMin ? String(amountMin) : "")
  const [draftAmountMax, setDraftAmountMax] = useState(amountMax ? String(amountMax) : "")
  const [draftCrossCurrency, setDraftCrossCurrency] = useState(crossCurrency)

  useEffect(() => {
    // Keep the input aligned with URL-driven navigation like back/forward or filter applies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchValue(query ?? "")
  }, [query])

  useEffect(() => {
    const appliedViewState = parseViewState(view)
    const timeoutId = window.setTimeout(() => {
      const nextHref = buildHref({
        pathname,
        query: searchValue,
        feed: appliedViewState.feed,
        direction: appliedViewState.direction,
        sort: (sortOptions.find((option) => option.value === sort)?.value ?? "recent"),
        datePreset,
        dateFrom: dateFrom ?? "",
        dateTo: dateTo ?? "",
        categories: selectedCategories,
        merchants: selectedMerchants,
        amountMin: typeof amountMin === "number" ? String(amountMin) : "",
        amountMax: typeof amountMax === "number" ? String(amountMax) : "",
        types: selectedTypes,
        instruments: selectedInstruments,
        processors: selectedProcessors,
        crossCurrency,
      })
      const currentQuery = searchParams.toString()
      const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname

      if (nextHref !== currentHref) {
        router.replace(nextHref)
      }
    }, 260)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    amountMax,
    amountMin,
    crossCurrency,
    dateFrom,
    datePreset,
    dateTo,
    pathname,
    router,
    searchValue,
    searchParams,
    selectedCategories,
    selectedInstruments,
    selectedMerchants,
    selectedProcessors,
    selectedTypes,
    sort,
    view,
  ])

  const appliedFilterCount = countAppliedFilterGroups({
    feed: viewState.feed,
    direction: viewState.direction,
    datePreset,
    dateFrom,
    dateTo,
    categories: selectedCategories,
    merchants: selectedMerchants,
    amountMin,
    amountMax,
    types: selectedTypes,
    instruments: selectedInstruments,
    processors: selectedProcessors,
    crossCurrency,
  })

  const categorySearch = panelSearch.toLowerCase()
  const filteredCategories = categories.filter((option) =>
    option.name.toLowerCase().includes(categorySearch),
  )
  const filteredMerchants = merchants.filter((option) =>
    option.name.toLowerCase().includes(categorySearch),
  )
  const filteredInstruments = paymentInstruments.filter((option) =>
    option.name.toLowerCase().includes(categorySearch),
  )
  const filteredProcessors = paymentProcessors.filter((option) =>
    option.name.toLowerCase().includes(categorySearch),
  )
  const filteredTypes = typeOptions.filter((option) =>
    option.label.toLowerCase().includes(categorySearch),
  )

  const currentFeedLabel =
    feedOptions.find((option) => option.value === draftFeed)?.label ?? "Transactions"
  const currentDirectionLabel =
    directionOptions.find((option) => option.value === draftDirection)?.label ?? "All directions"
  const currentSortLabel =
    sortOptions.find((option) => option.value === draftSort)?.label ?? "Most recent"

  const categorySummary = summarizeSelectedValues({
    values: draftCategories,
    options: categories.map((option) => ({
      value: option.slug,
      label: option.name,
    })),
    emptyLabel: "All categories",
  })
  const merchantSummary = summarizeSelectedValues({
    values: draftMerchants,
    options: merchants.map((option) => ({
      value: option.id,
      label: option.name,
    })),
    emptyLabel: "Any merchant",
  })
  const instrumentSummary = summarizeSelectedValues({
    values: draftInstruments,
    options: paymentInstruments.map((option) => ({
      value: option.id,
      label: option.name,
    })),
    emptyLabel: "Any instrument",
  })
  const processorSummary = summarizeSelectedValues({
    values: draftProcessors,
    options: paymentProcessors.map((option) => ({
      value: option.id,
      label: option.name,
    })),
    emptyLabel: "Any processor",
  })
  const typeSummary = summarizeSelectedValues({
    values: draftTypes,
    options: typeOptions.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    emptyLabel: "Any type",
  })
  const amountSummary =
    draftAmountMin || draftAmountMax
      ? [
          draftAmountMin
            ? formatMoney(Number(draftAmountMin), reportingCurrency)
            : "Min",
          draftAmountMax
            ? formatMoney(Number(draftAmountMax), reportingCurrency)
            : "Max",
        ].join(" - ")
      : `Any ${reportingCurrency} amount`
  const dateSummary = getDateSummary({
    preset: draftDatePreset,
    dateFrom: draftDateFrom,
    dateTo: draftDateTo,
  })

  function resetDrafts() {
    const nextViewState = parseViewState(view)

    setDraftFeed(nextViewState.feed)
    setDraftDirection(nextViewState.direction)
    setDraftSort((sortOptions.find((option) => option.value === sort)?.value ?? "recent"))
    setDraftDatePreset(datePreset)
    setDraftDateFrom(dateFrom ?? "")
    setDraftDateTo(dateTo ?? "")
    setDraftCategories(selectedCategories)
    setDraftMerchants(selectedMerchants)
    setDraftInstruments(selectedInstruments)
    setDraftProcessors(selectedProcessors)
    setDraftTypes(selectedTypes)
    setDraftAmountMin(amountMin ? String(amountMin) : "")
    setDraftAmountMax(amountMax ? String(amountMax) : "")
    setDraftCrossCurrency(crossCurrency)
    setPanelSearch("")
    setActivePanel("root")
  }

  function closePanelToRoot() {
    setPanelSearch("")
    setActivePanel("root")
  }

  function openFilters() {
    resetDrafts()
    setOpen(true)
  }

  function clearFilters() {
    setDraftDirection("all")
    setDraftSort("recent")
    setDraftDatePreset(undefined)
    setDraftDateFrom("")
    setDraftDateTo("")
    setDraftCategories([])
    setDraftMerchants([])
    setDraftInstruments([])
    setDraftProcessors([])
    setDraftTypes([])
    setDraftAmountMin("")
    setDraftAmountMax("")
    setDraftCrossCurrency(false)
    setPanelSearch("")
    setActivePanel("root")
  }

  const showingCanonicalFilters = isCanonicalView(draftFeed)

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 border-b border-white/[0.06] bg-[rgba(10,10,12,0.94)] px-4 pb-4 pt-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <RiSearchLine className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/28" />
            <Input
              type="search"
              value={searchValue}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSearchValue(event.target.value)
              }
              placeholder="search merchant or note"
              className="h-11 border-white/[0.06] bg-white/[0.03] pl-11 text-sm placeholder:text-white/24"
            />
          </div>

          <button
            type="button"
            onClick={openFilters}
            className="relative flex size-11 shrink-0 items-center justify-center border border-white/10 bg-[rgba(24,24,26,0.92)] text-white/72 transition hover:bg-[rgba(32,32,36,0.98)] hover:text-white"
            aria-label="Open filters"
          >
            <RiFilter3Line className="size-4" />
            {appliedFilterCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--neo-yellow)] text-[0.65rem] font-semibold text-[var(--neo-black)]">
                {appliedFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="border-t border-white/8 bg-[rgba(12,12,14,0.98)] pb-6"
          showCloseButton
        >
          <SheetHeader className="px-5 pt-0 sm:px-6">
            <div className="flex items-center gap-2">
              {activePanel !== "root" ? (
                <button
                  type="button"
                  onClick={() => {
                    setPanelSearch("")
                    setActivePanel("root")
                  }}
                  className="flex size-8 items-center justify-center text-white/54 transition hover:text-white"
                  aria-label="Back to filters"
                >
                  <RiArrowLeftSLine className="size-5" />
                </button>
              ) : null}
              <SheetTitle>Filter</SheetTitle>
            </div>
            <SheetDescription>
              Refine the feed without leaving the timeline.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 pt-5 sm:px-6">
            {activePanel === "root" ? (
              <>
                <div className="space-y-3">
                  <FilterRow
                    label="Feed"
                    value={currentFeedLabel}
                    onClick={() => setActivePanel("feed")}
                  />

                  {showingCanonicalFilters ? (
                    <>
                      <FilterRow
                        label="Date range"
                        value={dateSummary}
                        onClick={() => setActivePanel("date")}
                      />
                      <FilterRow
                        label="Direction"
                        value={currentDirectionLabel}
                        onClick={() => setActivePanel("direction")}
                      />
                      <FilterRow
                        label="Category"
                        value={categorySummary}
                        onClick={() => setActivePanel("category")}
                      />
                    </>
                  ) : null}

                  <FilterRow
                    label="Merchant"
                    value={merchantSummary}
                    onClick={() => setActivePanel("merchant")}
                  />

                  {showingCanonicalFilters ? (
                    <>
                      <FilterRow
                        label="Amount range"
                        value={amountSummary}
                        onClick={() => setActivePanel("amount")}
                      />
                      <FilterRow
                        label="Type"
                        value={typeSummary}
                        onClick={() => setActivePanel("type")}
                      />
                      <FilterRow
                        label="Instrument"
                        value={instrumentSummary}
                        onClick={() => setActivePanel("instrument")}
                      />
                      <FilterRow
                        label="Processor"
                        value={processorSummary}
                        onClick={() => setActivePanel("processor")}
                      />
                      <FilterRow
                        label="Cross-currency"
                        value={draftCrossCurrency ? "Only cross-currency" : "Any currency"}
                        onClick={() => setActivePanel("cross_currency")}
                      />
                    </>
                  ) : null}
                </div>

                {showingCanonicalFilters ? (
                  <div className="space-y-3 border-t border-white/8 pt-4">
                    <FilterRow
                      label="Sort"
                      value={currentSortLabel}
                      onClick={() => setActivePanel("sort")}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {activePanel === "feed" ? (
              <div className="grid gap-2">
                {feedOptions.map((option) => (
                  <SelectionButton
                    key={option.value}
                    active={draftFeed === option.value}
                    onClick={() => {
                      setDraftFeed(option.value)
                      if (option.value !== "all" && option.value !== "review") {
                        setDraftDirection("all")
                      }
                      closePanelToRoot()
                    }}
                  >
                    {option.label}
                  </SelectionButton>
                ))}
              </div>
            ) : null}

            {activePanel === "direction" ? (
              <div className="grid gap-2">
                {directionOptions.map((option) => (
                  <SelectionButton
                    key={option.value}
                    active={draftDirection === option.value}
                    onClick={() => {
                      setDraftDirection(option.value)
                      closePanelToRoot()
                    }}
                  >
                    {option.label}
                  </SelectionButton>
                ))}
              </div>
            ) : null}

            {activePanel === "date" ? (
              <div className="space-y-3">
                <div className="grid gap-2">
                  <SelectionButton
                    active={!draftDatePreset && !draftDateFrom && !draftDateTo}
                    onClick={() => {
                      setDraftDatePreset(undefined)
                      setDraftDateFrom("")
                      setDraftDateTo("")
                      closePanelToRoot()
                    }}
                  >
                    Any time
                  </SelectionButton>
                  {datePresetOptions.map((option) => (
                    <SelectionButton
                      key={option.value}
                      active={draftDatePreset === option.value}
                      onClick={() => {
                        setDraftDatePreset(option.value)
                        setDraftDateFrom("")
                        setDraftDateTo("")
                        closePanelToRoot()
                      }}
                    >
                      {option.label}
                    </SelectionButton>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setActivePanel("date_custom")}
                  className="flex w-full items-center justify-between border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-4 text-left text-sm text-white/72 transition hover:bg-[rgba(255,255,255,0.04)]"
                >
                  <span>Custom range</span>
                  <RiArrowRightSLine className="size-4 shrink-0" />
                </button>
              </div>
            ) : null}

            {activePanel === "date_custom" ? (
              <div className="space-y-3">
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm text-white/56">
                    <span>Start date</span>
                    <Input
                      type="date"
                      value={draftDateFrom}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraftDateFrom(event.target.value)
                      }
                      className="h-11 border-white/[0.06] bg-white/[0.03] text-sm"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-white/56">
                    <span>End date</span>
                    <Input
                      type="date"
                      value={draftDateTo}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraftDateTo(event.target.value)
                      }
                      className="h-11 border-white/[0.06] bg-white/[0.03] text-sm"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDraftDatePreset(undefined)
                      setDraftDateFrom("")
                      setDraftDateTo("")
                      closePanelToRoot()
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDraftDatePreset(undefined)
                      closePanelToRoot()
                    }}
                  >
                    Use range
                  </Button>
                </div>
              </div>
            ) : null}

            {activePanel === "category" ? (
              <SearchableOptionList
                value={panelSearch}
                onValueChange={setPanelSearch}
                placeholder="Search categories"
                options={filteredCategories.map((option) => ({
                  key: option.slug,
                  label: option.name,
                  selected: draftCategories.includes(option.slug),
                  onSelect: () => {
                    setDraftCategories(toggleValue(draftCategories, option.slug))
                    closePanelToRoot()
                  },
                }))}
              />
            ) : null}

            {activePanel === "merchant" ? (
              <SearchableOptionList
                value={panelSearch}
                onValueChange={setPanelSearch}
                placeholder="Search merchants"
                options={filteredMerchants.map((option) => ({
                  key: option.id,
                  label: option.name,
                  selected: draftMerchants.includes(option.id),
                  onSelect: () => {
                    setDraftMerchants(toggleValue(draftMerchants, option.id))
                    closePanelToRoot()
                  },
                }))}
              />
            ) : null}

            {activePanel === "type" ? (
              <SearchableOptionList
                value={panelSearch}
                onValueChange={setPanelSearch}
                placeholder="Search types"
                options={filteredTypes.map((option) => ({
                  key: option.value,
                  label: option.label,
                  selected: draftTypes.includes(option.value),
                  onSelect: () => {
                    setDraftTypes(toggleValue(draftTypes, option.value))
                    closePanelToRoot()
                  },
                }))}
              />
            ) : null}

            {activePanel === "instrument" ? (
              <SearchableOptionList
                value={panelSearch}
                onValueChange={setPanelSearch}
                placeholder="Search instruments"
                options={filteredInstruments.map((option) => ({
                  key: option.id,
                  label: option.name,
                  selected: draftInstruments.includes(option.id),
                  onSelect: () => {
                    setDraftInstruments(toggleValue(draftInstruments, option.id))
                    closePanelToRoot()
                  },
                }))}
              />
            ) : null}

            {activePanel === "processor" ? (
              <SearchableOptionList
                value={panelSearch}
                onValueChange={setPanelSearch}
                placeholder="Search processors"
                options={filteredProcessors.map((option) => ({
                  key: option.id,
                  label: option.name,
                  selected: draftProcessors.includes(option.id),
                  onSelect: () => {
                    setDraftProcessors(toggleValue(draftProcessors, option.id))
                    closePanelToRoot()
                  },
                }))}
              />
            ) : null}

            {activePanel === "amount" ? (
              <div className="space-y-3">
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm text-white/56">
                    <span>Minimum ({reportingCurrency})</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftAmountMin}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraftAmountMin(event.target.value)
                      }
                      placeholder="0.00"
                      className="h-11 border-white/[0.06] bg-white/[0.03] text-sm"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-white/56">
                    <span>Maximum ({reportingCurrency})</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftAmountMax}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraftAmountMax(event.target.value)
                      }
                      placeholder="0.00"
                      className="h-11 border-white/[0.06] bg-white/[0.03] text-sm"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDraftAmountMin("")
                      setDraftAmountMax("")
                      closePanelToRoot()
                    }}
                  >
                    Clear
                  </Button>
                  <Button type="button" variant="secondary" onClick={closePanelToRoot}>
                    Use range
                  </Button>
                </div>
              </div>
            ) : null}

            {activePanel === "cross_currency" ? (
              <div className="grid gap-2">
                <SelectionButton
                  active={!draftCrossCurrency}
                  onClick={() => {
                    setDraftCrossCurrency(false)
                    closePanelToRoot()
                  }}
                >
                  Any currency
                </SelectionButton>
                <SelectionButton
                  active={draftCrossCurrency}
                  onClick={() => {
                    setDraftCrossCurrency(true)
                    closePanelToRoot()
                  }}
                >
                  Only cross-currency
                </SelectionButton>
              </div>
            ) : null}

            {activePanel === "sort" ? (
              <div className="grid gap-2">
                {sortOptions.map((option) => (
                  <SelectionButton
                    key={option.value}
                    active={draftSort === option.value}
                    onClick={() => {
                      setDraftSort(option.value)
                      closePanelToRoot()
                    }}
                  >
                    {option.label}
                  </SelectionButton>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  clearFilters()
                  router.push(
                    buildHref({
                      pathname,
                      query: searchValue,
                      feed: draftFeed,
                      direction: "all",
                      sort: "recent",
                      datePreset: undefined,
                      dateFrom: "",
                      dateTo: "",
                      categories: [],
                      merchants: [],
                      amountMin: "",
                      amountMax: "",
                      types: [],
                      instruments: [],
                      processors: [],
                      crossCurrency: false,
                    }),
                  )
                  setOpen(false)
                }}
              >
                Clear all
              </Button>
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center border border-[rgba(255,231,90,0.35)] bg-[var(--neo-yellow)] px-5 text-sm font-semibold text-[var(--neo-black)] transition hover:brightness-[1.03] active:translate-y-px"
                onClick={() => {
                  router.push(
                    buildHref({
                      pathname,
                      query: searchValue,
                      feed: draftFeed,
                      direction: draftDirection,
                      sort: draftSort,
                      datePreset: draftDatePreset,
                      dateFrom: draftDateFrom,
                      dateTo: draftDateTo,
                      categories: draftCategories,
                      merchants: draftMerchants,
                      amountMin: draftAmountMin,
                      amountMax: draftAmountMax,
                      types: draftTypes,
                      instruments: draftInstruments,
                      processors: draftProcessors,
                      crossCurrency: draftCrossCurrency,
                    }),
                  )
                  setOpen(false)
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function buildHref(input: {
  pathname: string
  query?: string
  feed: FeedValue
  direction: DirectionValue
  sort: SortValue
  datePreset?: string
  dateFrom?: string
  dateTo?: string
  categories: string[]
  merchants: string[]
  amountMin?: string
  amountMax?: string
  types: string[]
  instruments: string[]
  processors: string[]
  crossCurrency: boolean
}) {
  const searchParams = new URLSearchParams()
  const nextQuery = input.query?.trim()
  const nextView =
    input.feed === "all"
      ? input.direction === "all"
        ? "all"
        : input.direction
      : input.feed
  const canonicalView = input.feed === "all" || input.feed === "review"

  if (nextQuery) searchParams.set("query", nextQuery)
  if (nextView !== "all") searchParams.set("view", nextView)
  if (canonicalView && input.sort !== "recent") searchParams.set("sort", input.sort)

  if (canonicalView && input.datePreset) {
    searchParams.set("datePreset", input.datePreset)
  } else if (canonicalView) {
    if (input.dateFrom) searchParams.set("dateFrom", input.dateFrom)
    if (input.dateTo) searchParams.set("dateTo", input.dateTo)
  }

  if (canonicalView) {
    for (const category of input.categories) {
      searchParams.append("category", category)
    }
  }

  for (const merchant of input.merchants) {
    searchParams.append("merchant", merchant)
  }

  if (canonicalView) {
    if (input.amountMin?.trim()) searchParams.set("amountMin", input.amountMin.trim())
    if (input.amountMax?.trim()) searchParams.set("amountMax", input.amountMax.trim())

    for (const type of input.types) {
      searchParams.append("type", type)
    }

    for (const instrument of input.instruments) {
      searchParams.append("instrument", instrument)
    }

    for (const processor of input.processors) {
      searchParams.append("processor", processor)
    }

    if (input.crossCurrency) {
      searchParams.set("crossCurrency", "true")
    }
  }

  const serialized = searchParams.toString()
  return serialized ? `${input.pathname}?${serialized}` : input.pathname
}

function getDateSummary(input: {
  preset?: string
  dateFrom?: string
  dateTo?: string
}) {
  if (input.preset) {
    return (
      datePresetOptions.find((option) => option.value === input.preset)?.label ??
      "Date range"
    )
  }

  if (input.dateFrom || input.dateTo) {
    return [input.dateFrom || "Start", input.dateTo || "End"].join(" - ")
  }

  return "Any time"
}

function summarizeSelectedValues(input: {
  values: string[]
  options: Array<{
    value: string
    label: string
  }>
  emptyLabel: string
}) {
  if (input.values.length === 0) {
    return input.emptyLabel
  }

  if (input.values.length === 1) {
    return (
      input.options.find((option) => option.value === input.values[0])?.label ??
      input.emptyLabel
    )
  }

  return `${input.values.length} selected`
}

function FilterRow({
  label,
  value,
  onClick,
}: {
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4 text-left transition hover:bg-[rgba(255,255,255,0.05)]"
    >
      <span className="text-sm font-medium text-white">{label}</span>
      <span className="flex items-center gap-2 text-sm text-white/42">
        <span className="truncate">{value}</span>
        <RiArrowRightSLine className="size-4 shrink-0" />
      </span>
    </button>
  )
}

function SelectionButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "border px-3 py-3 text-left text-sm transition",
        active
          ? "border-[var(--neo-yellow)] bg-[rgba(255,231,90,0.12)] text-white"
          : "border-white/8 bg-[rgba(255,255,255,0.02)] text-white/58 hover:bg-[rgba(255,255,255,0.04)]",
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function SearchableOptionList({
  value,
  onValueChange,
  placeholder,
  options,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  options: Array<{
    key: string
    label: string
    selected: boolean
    onSelect: () => void
  }>
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <RiSearchLine className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/28" />
        <Input
          type="search"
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onValueChange(event.target.value)
          }
          placeholder={placeholder}
          className="h-11 border-white/[0.06] bg-white/[0.03] pl-11 text-sm placeholder:text-white/24"
        />
      </div>

      <div className="grid max-h-[48vh] gap-2 overflow-y-auto pr-1">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={option.onSelect}
            className={[
              "flex items-center justify-between border px-3 py-3 text-left text-sm transition",
              option.selected
                ? "border-[var(--neo-yellow)] bg-[rgba(255,231,90,0.12)] text-white"
                : "border-white/8 bg-[rgba(255,255,255,0.02)] text-white/58 hover:bg-[rgba(255,255,255,0.04)]",
            ].join(" ")}
          >
            <span>{option.label}</span>
            {option.selected ? <RiCheckLine className="size-4 shrink-0 text-[var(--neo-yellow)]" /> : null}
          </button>
        ))}
        {options.length === 0 ? (
          <div className="border border-dashed border-white/8 px-4 py-6 text-sm text-white/32">
            Nothing matches this search.
          </div>
        ) : null}
      </div>
    </div>
  )
}
