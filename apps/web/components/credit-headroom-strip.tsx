type CreditHeadroomStripProps = {
  entries: Array<{
    label: string
    amount: string
    observedAt: string
  }>
}

export function CreditHeadroomStrip({ entries }: CreditHeadroomStripProps) {
  if (entries.length === 0) {
    return null
  }

  return (
    <div className="neo-panel p-5 md:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="neo-kicker">Credit headroom</p>
          <h2 className="mt-3 font-display text-[2rem] leading-none text-white">
            limits in view
          </h2>
        </div>
      </div>
      <div className="mt-6 grid gap-3">
        {entries.map((entry) => (
          <div
            key={`${entry.label}:${entry.observedAt}`}
            className="flex items-center justify-between border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4"
          >
            <div>
              <p className="text-sm font-medium text-white">{entry.label}</p>
              <p className="mt-1 text-xs text-white/36">{entry.observedAt}</p>
            </div>
            <p className="text-sm font-semibold text-[var(--neo-green)]">{entry.amount}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
