import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"

type SourceTrace = {
  linkReason: string
  signalType: string | null
  rawDocumentLabel: string
}

type TransactionCardProps = {
  merchant: string
  amount: string
  dateLabel: string
  category: string
  direction: "inflow" | "outflow" | "neutral"
  eventType: string
  needsReview: boolean
  paymentInstrument: string | null
  traces?: SourceTrace[]
}

function getBadgeVariant(
  direction: TransactionCardProps["direction"],
  needsReview: boolean,
) {
  if (needsReview) {
    return "warning"
  }

  if (direction === "inflow") {
    return "success"
  }

  if (direction === "neutral") {
    return "violet"
  }

  return "cream"
}

export function TransactionCard({
  merchant,
  amount,
  dateLabel,
  category,
  direction,
  eventType,
  needsReview,
  paymentInstrument,
  traces = [],
}: TransactionCardProps) {
  return (
    <Card className="border-white/8 bg-[rgba(18,18,20,0.94)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="neo-kicker">{dateLabel}</p>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-white">{merchant}</h2>
          <p className="mt-2 text-sm text-white/54">
            {category} · {paymentInstrument ?? "unlinked"}
          </p>
        </div>
        <div className="text-right">
          <Badge variant={getBadgeVariant(direction, needsReview)}>
            {needsReview ? "Review" : direction}
          </Badge>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{amount}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-white/34">{eventType}</p>
        </div>
      </div>

      {traces.length > 0 ? (
        <details className="mt-5 border-t border-white/8 pt-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-white/72">
            Trace this event
          </summary>
          <div className="mt-4 grid gap-3">
            {traces.map((trace) => (
              <div key={`${trace.linkReason}-${trace.rawDocumentLabel}`} className="border border-white/8 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/36">
                  {trace.linkReason}
                </p>
                <p className="mt-2 text-sm text-white/72">
                  {trace.signalType ?? "signal unavailable"} · {trace.rawDocumentLabel}
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <div className="mt-5">
          <Button variant="ghost" size="sm" disabled>
            No source detail
          </Button>
        </div>
      )}
    </Card>
  )
}
