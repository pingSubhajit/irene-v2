"use client"

import { startTransition, useEffect, useMemo, useState, type ChangeEvent } from "react"

import {
  RiLoader4Line,
  RiSearchLine,
} from "@remixicon/react"
import { useRouter } from "next/navigation"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

type LogoSearchResult = {
  name: string
  domain: string | null
  logoUrl: string | null
}

type MerchantLogoPickerProps = {
  merchantId: string
  merchantName: string
  currentLogoUrl: string | null
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 1))
      .join("")
      .toUpperCase() || "?"
  )
}

export function MerchantLogoPicker({
  merchantId,
  merchantName,
  currentLogoUrl,
}: MerchantLogoPickerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(merchantName)
  const [results, setResults] = useState<LogoSearchResult[]>([])
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string | null>(currentLogoUrl)
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initials = useMemo(() => getInitials(merchantName), [merchantName])

  useEffect(() => {
    if (!open) {
      return
    }

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setResults([])
      setSelectedLogoUrl(currentLogoUrl)
      setError(null)
      return
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true)
      setError(null)

      try {
        const response = await fetch(`/api/logo/search?query=${encodeURIComponent(trimmedQuery)}`, {
          cache: "no-store",
        })
        const payload = (await response.json()) as {
          error?: string
          results?: LogoSearchResult[]
        }

        if (!response.ok) {
          throw new Error(payload.error ?? "Logo search failed.")
        }

        const nextResults = payload.results ?? []
        setResults(nextResults)
        setSelectedLogoUrl((currentSelected) => {
          const selectionStillVisible =
            currentSelected &&
            nextResults.some((result) => result.logoUrl === currentSelected)

          if (selectionStillVisible) {
            return currentSelected
          }

          return nextResults[0]?.logoUrl ?? currentLogoUrl
        })

        if (nextResults.length === 0) {
          setError("No logo matches found for that search.")
        }
      } catch (searchError) {
        setResults([])
        setSelectedLogoUrl(currentLogoUrl)
        setError(searchError instanceof Error ? searchError.message : "Logo search failed.")
      } finally {
        setIsSearching(false)
      }
    }, 280)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentLogoUrl, open, query])

  async function applyLogo() {
    if (!selectedLogoUrl) {
      setError("Choose a logo option first.")
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/merchants/${merchantId}/logo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ logoUrl: selectedLogoUrl }),
      })
      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update merchant logo.")
      }

      setOpen(false)
      startTransition(() => {
        router.refresh()
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update merchant logo.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setError(null)
          setSelectedLogoUrl(currentLogoUrl)
          setQuery(merchantName)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 transition hover:opacity-90"
        aria-label={`Change ${merchantName} logo`}
      >
        <Avatar className="size-12 rounded-full bg-white/[0.07]">
          {currentLogoUrl ? (
            <AvatarImage src={currentLogoUrl} alt={merchantName} />
          ) : (
            <AvatarFallback className="bg-white/[0.07] text-sm font-semibold tracking-wide text-white/50">
              {initials}
            </AvatarFallback>
          )}
        </Avatar>
      </button>

      <SheetContent
        side="bottom"
        className="border-t border-white/8 bg-[rgba(12,12,14,0.98)] pb-6"
        showCloseButton
      >
        <SheetHeader className="px-5 pt-0 sm:px-6">
          <SheetTitle>Merchant logo</SheetTitle>
          <SheetDescription>
            Pick a cleaner logo for {merchantName}.
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 pt-5 sm:px-6">
          <div className="grid grid-cols-4 gap-3">
            {results.slice(0, 4).map((result) => {
              const isSelected = result.logoUrl === selectedLogoUrl

              return (
                <button
                  key={`${result.name}:${result.domain ?? "direct"}`}
                  type="button"
                  onClick={() => setSelectedLogoUrl(result.logoUrl)}
                  className={[
                    "group relative aspect-square overflow-hidden rounded-[1.65rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-0 transition",
                    isSelected
                      ? "border-[var(--neo-yellow)] shadow-[0_0_0_1px_rgba(255,231,90,0.15)]"
                      : "border-white/8 hover:border-white/18",
                  ].join(" ")}
                  aria-label={`Use ${result.name} logo`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_62%)]" />
                  <Avatar className="absolute inset-3 rounded-[1.25rem] border-white/8 bg-[rgba(16,16,18,0.92)]">
                    {result.logoUrl ? (
                      <AvatarImage src={result.logoUrl} alt={result.name} />
                    ) : (
                      <AvatarFallback className="bg-[rgba(16,16,18,0.92)] text-sm font-semibold tracking-wide text-white/50">
                        {getInitials(result.name)}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </button>
              )
            })}

            {results.length === 0
              ? Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={`placeholder-${index}`}
                    className="aspect-square rounded-[1.65rem] border border-dashed border-white/8 bg-[rgba(255,255,255,0.02)]"
                  />
                ))
              : null}
          </div>

          <div className="relative mt-5">
            <RiSearchLine className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/28" />
            <Input
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setQuery(event.target.value)
              }
              placeholder="Search brand name"
              className="h-14 border-white/8 bg-[rgba(18,18,20,0.98)] pl-11 text-base"
            />
            {isSearching ? (
              <RiLoader4Line className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-white/32" />
            ) : null}
          </div>

          {error && <p className="mt-3 text-sm text-[var(--neo-coral)]">{error}</p>}

          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={isSaving || !selectedLogoUrl}
            onClick={() => void applyLogo()}
            className="mt-6 w-full"
          >
            {isSaving ? (
              <>
                <RiLoader4Line className="size-4 animate-spin" />
                Setting logo
              </>
            ) : (
              "Set logo"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
