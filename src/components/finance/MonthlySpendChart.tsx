import clsx from "clsx";

type Month = { month: string; total: number };

/** Round the axis maximum up to 1, 2, 2.5 or 5 × 10ⁿ so the gridlines land on clean numbers. */
function niceMax(max: number) {
  if (max <= 0) return 100000;
  const exp = Math.pow(10, Math.floor(Math.log10(max / 4)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * exp).find((s) => s * 4 >= max) ?? 10 * exp;
  return step * 4;
}

/**
 * Spending per month as calm columns: one brand colour, faint gridlines, value on hover and keyboard focus.
 * The current month is drawn lighter because it is not finished. A hidden table carries every value.
 */
export default function MonthlySpendChart({ months, currency = "EUR", currentMonth }: {
  months: Month[]; currency?: string; currentMonth: string;
}) {
  const top = niceMax(Math.max(...months.map((m) => m.total)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const compact = new Intl.NumberFormat("en-GB", { style: "currency", currency, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const full = new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 });
  const monthName = (m: string, style: "short" | "long" | "narrow") =>
    new Date(`${m}T00:00:00`).toLocaleDateString("en-GB", { month: style, ...(style === "long" ? { year: "numeric" } : {}) });

  return (
    <figure className="m-0">
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        {/* Y axis */}
        <div className="relative h-48 w-11 text-right text-xs text-muted tabular" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / top) * 100}%` }}>
              {compact.format(t / 100)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative h-48">
          {ticks.map((t) => (
            <div key={t} aria-hidden className={clsx("absolute inset-x-0 border-t", t === 0 ? "border-line-strong/40" : "border-line")}
              style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <ol className="relative flex h-full items-end" aria-label="Spending per month">
            {months.map((m, i) => {
              const edge = i < 2 ? "left-0" : i > months.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
              const partial = m.month === currentMonth;
              const label = `${monthName(m.month, "long")}${partial ? " (so far)" : ""}: ${full.format(m.total / 100)}`;
              return (
                <li key={m.month} className="group relative flex h-full flex-1 items-end justify-center px-[2px]">
                  <span
                    tabIndex={0}
                    title={label}
                    aria-label={label}
                    className={clsx(
                      "block w-full max-w-6 rounded-t-[4px] outline-offset-2 transition-[filter] group-hover:brightness-110",
                      partial ? "bg-brand/45" : "bg-brand",
                    )}
                    style={{ height: m.total > 0 ? `max(2px, ${(m.total / top) * 100}%)` : 0 }}
                  />
                  <span aria-hidden
                    className={clsx("pointer-events-none absolute z-10 hidden whitespace-nowrap", edge,
                      " rounded-lg bg-ink px-2.5 py-1 text-xs text-surface shadow-pop group-focus-within:block group-hover:block")}
                    style={{ bottom: `calc(${Math.min(1, m.total / top) * 100}% + 0.25rem)` }}>
                    <span className="font-semibold tabular">{full.format(m.total / 100)}</span>
                    <span className="ml-1.5 opacity-75">{monthName(m.month, "short")}{partial ? " so far" : ""}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* X axis */}
        <div aria-hidden />
        <ol aria-hidden className="mt-1.5 flex text-center text-xs text-muted">
          {months.map((m) => (
            <li key={m.month} className="flex-1">
              <span className="sm:hidden">{monthName(m.month, "narrow")}</span>
              <span className="hidden sm:inline">{monthName(m.month, "short")}</span>
            </li>
          ))}
        </ol>
      </div>

      <table className="sr-only">
        <caption>Spending per month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Spent</th></tr></thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}><th scope="row">{monthName(m.month, "long")}</th><td>{full.format(m.total / 100)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
