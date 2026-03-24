"use client"

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiFilter3Line,
  RiPushpin2Fill,
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

const statusOptions = [
  { value: "all", label: "All memories" },
  { value: "active", label: "Active only" },
  { value: "disabled", label: "Disabled only" },
] as const

const sourceOptions = [
  { value: "feedback", label: "From your edits" },
  { value: "review", label: "From review" },
  { value: "automation", label: "Learned" },
  { value: "system_rebuild", label: "Rebuilt" },
] as const

const familyOptions = [
  { value: "merchant", label: "Merchant" },
  { value: "instrument", label: "Instrument" },
  { value: "institution", label: "Institution" },
  { value: "income", label: "Income" },
  { value: "other", label: "Other" },
] as const

const sortOptions = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
  { value: "confidence_desc", label: "Highest confidence" },
  { value: "confidence_asc", label: "Lowest confidence" },
] as const

type StatusValue = (typeof statusOptions)[number]["value"]
type SourceValue = (typeof sourceOptions)[number]["value"]
type FamilyValue = (typeof familyOptions)[number]["value"]
type SortValue = (typeof sortOptions)[number]["value"]
type Panel = "root" | "status" | "source" | "family" | "pinned" | "sort"

type MemoryToolbarProps = {
  query?: string
  status: StatusValue
  selectedSources: SourceValue[]
  selectedFamilies: FamilyValue[]
  pinnedOnly: boolean
  sort: SortValue
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]
}

function countAppliedFilterGroups(input: {
  status: StatusValue
  selectedSources: SourceValue[]
  selectedFamilies: FamilyValue[]
  pinnedOnly: boolean
  sort: SortValue
}) {
  let count = 0
  if (input.status !== "all") count += 1
  if (input.selectedSources.length > 0) count += 1
  if (input.selectedFamilies.length > 0) count += 1
  if (input.pinnedOnly) count += 1
  if (input.sort !== "recent") count += 1
  return count
}

function buildHref(input: {
  pathname: string
  query?: string
  status: StatusValue
  selectedSources: SourceValue[]
  selectedFamilies: FamilyValue[]
  pinnedOnly: boolean
  sort: SortValue
}) {
  const searchParams = new URLSearchParams()
  const nextQuery = input.query?.trim()

  if (nextQuery) searchParams.set("query", nextQuery)
  if (input.status !== "all") searchParams.set("status", input.status)
  if (input.sort !== "recent") searchParams.set("sort", input.sort)
  if (input.pinnedOnly) searchParams.set("pinned", "true")
  for (const source of input.selectedSources) searchParams.append("source", source)
  for (const family of input.selectedFamilies) searchParams.append("family", family)

  const search = searchParams.toString()
  return search ? `${input.pathname}?${search}` : input.pathname
}

export function MemoryToolbar({
  query,
  status,
  selectedSources,
  selectedFamilies,
  pinnedOnly,
  sort,
}: MemoryToolbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<Panel>("root")
  const [searchValue, setSearchValue] = useState(query ?? "")
  const [draftStatus, setDraftStatus] = useState<StatusValue>(status)
  const [draftSources, setDraftSources] = useState<SourceValue[]>(selectedSources)
  const [draftFamilies, setDraftFamilies] = useState<FamilyValue[]>(selectedFamilies)
  const [draftPinnedOnly, setDraftPinnedOnly] = useState(pinnedOnly)
  const [draftSort, setDraftSort] = useState<SortValue>(sort)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextHref = buildHref({
        pathname,
        query: searchValue,
        status,
        selectedSources,
        selectedFamilies,
        pinnedOnly,
        sort,
      })
      const currentSearch = searchParams.toString()
      const currentHref = currentSearch ? `${pathname}?${currentSearch}` : pathname

      if (nextHref !== currentHref) {
        router.replace(nextHref)
      }
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [pathname, pinnedOnly, router, searchParams, searchValue, selectedFamilies, selectedSources, sort, status])

  const appliedFilterCount = countAppliedFilterGroups({
    status,
    selectedSources,
    selectedFamilies,
    pinnedOnly,
    sort,
  })

  const statusSummary = statusOptions.find((option) => option.value === draftStatus)?.label ?? "All memories"
  const sourceSummary = draftSources.length === 0
    ? "Any source"
    : draftSources.length === 1
      ? sourceOptions.find((option) => option.value === draftSources[0])?.label ?? "1 selected"
      : `${draftSources.length} selected`
  const familySummary = draftFamilies.length === 0
    ? "Any type"
    : draftFamilies.length === 1
      ? familyOptions.find((option) => option.value === draftFamilies[0])?.label ?? "1 selected"
      : `${draftFamilies.length} selected`
  const sortSummary = sortOptions.find((option) => option.value === draftSort)?.label ?? "Most recent"

  function closePanelToRoot() {
    setActivePanel("root")
  }

  function clearFilters() {
    setDraftStatus("all")
    setDraftSources([])
    setDraftFamilies([])
    setDraftPinnedOnly(false)
    setDraftSort("recent")
    setActivePanel("root")
  }

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
              placeholder="search memory, merchant, or sender"
              className="h-11 border-white/[0.06] bg-white/[0.03] pl-11 text-sm placeholder:text-white/24"
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative flex size-11 shrink-0 items-center justify-center border border-white/10 bg-[rgba(24,24,26,0.92)] text-white/72 transition hover:bg-[rgba(32,32,36,0.98)] hover:text-white"
            aria-label="Open memory filters"
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
        <SheetContent side="bottom" className="border-t border-white/8 bg-[rgba(12,12,14,0.98)] pb-6" showCloseButton>
          <SheetHeader className="px-5 pt-0 sm:px-6">
            <div className="flex items-center gap-2">
              {activePanel !== "root" ? (
                <button
                  type="button"
                  onClick={() => setActivePanel("root")}
                  className="flex size-8 items-center justify-center text-white/54 transition hover:text-white"
                  aria-label="Back to memory filters"
                >
                  <RiArrowLeftSLine className="size-5" />
                </button>
              ) : null}
              <SheetTitle>Filter</SheetTitle>
            </div>
            <SheetDescription>Refine the memory list without leaving settings.</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 pt-5 sm:px-6">
            {activePanel === "root" ? (
              <div className="space-y-3">
                <FilterRow label="Status" value={statusSummary} onClick={() => setActivePanel("status")} />
                <FilterRow label="Source" value={sourceSummary} onClick={() => setActivePanel("source")} />
                <FilterRow label="Type" value={familySummary} onClick={() => setActivePanel("family")} />
                <FilterRow label="Pinned" value={draftPinnedOnly ? "Only pinned" : "Any"} onClick={() => setActivePanel("pinned")} />
                <FilterRow label="Sort" value={sortSummary} onClick={() => setActivePanel("sort")} />
              </div>
            ) : null}

            {activePanel === "status" ? (
              <div className="grid gap-2">
                {statusOptions.map((option) => (
                  <SelectionButton
                    key={option.value}
                    active={draftStatus === option.value}
                    onClick={() => {
                      setDraftStatus(option.value)
                      closePanelToRoot()
                    }}
                  >
                    {option.label}
                  </SelectionButton>
                ))}
              </div>
            ) : null}

            {activePanel === "source" ? (
              <div className="grid gap-2">
                {sourceOptions.map((option) => (
                  <SelectionButton
                    key={option.value}
                    active={draftSources.includes(option.value)}
                    onClick={() => setDraftSources(toggleValue(draftSources, option.value))}
                  >
                    {option.label}
                  </SelectionButton>
                ))}
              </div>
            ) : null}

            {activePanel === "family" ? (
              <div className="grid gap-2">
                {familyOptions.map((option) => (
                  <SelectionButton
                    key={option.value}
                    active={draftFamilies.includes(option.value)}
                    onClick={() => setDraftFamilies(toggleValue(draftFamilies, option.value))}
                  >
                    {option.label}
                  </SelectionButton>
                ))}
              </div>
            ) : null}

            {activePanel === "pinned" ? (
              <div className="grid gap-2">
                <SelectionButton
                  active={!draftPinnedOnly}
                  onClick={() => {
                    setDraftPinnedOnly(false)
                    closePanelToRoot()
                  }}
                >
                  Any memory
                </SelectionButton>
                <SelectionButton
                  active={draftPinnedOnly}
                  onClick={() => {
                    setDraftPinnedOnly(true)
                    closePanelToRoot()
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <RiPushpin2Fill className="size-3.5" />
                    Only pinned
                  </span>
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
                      status: "all",
                      selectedSources: [],
                      selectedFamilies: [],
                      pinnedOnly: false,
                      sort: "recent",
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
                      status: draftStatus,
                      selectedSources: draftSources,
                      selectedFamilies: draftFamilies,
                      pinnedOnly: draftPinnedOnly,
                      sort: draftSort,
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
      className="flex w-full items-center justify-between border border-white/8 bg-[rgba(255,255,255,0.02)] px-4 py-4 text-left text-sm text-white/72 transition hover:bg-[rgba(255,255,255,0.04)]"
    >
      <span>{label}</span>
      <span className="inline-flex items-center gap-2 text-white/42">
        <span>{value}</span>
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
        "flex w-full items-center justify-between border px-4 py-4 text-left text-sm transition",
        active
          ? "border-white/18 bg-white/[0.06] text-white"
          : "border-white/8 bg-[rgba(255,255,255,0.02)] text-white/72 hover:bg-[rgba(255,255,255,0.04)]",
      ].join(" ")}
    >
      <span>{children}</span>
      {active ? <RiCheckLine className="size-4 shrink-0 text-white/72" /> : null}
    </button>
  )
}
