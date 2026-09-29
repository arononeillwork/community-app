import clsx from "clsx";
import { Check, Minus } from "lucide-react";
import { DAY_NAMES, DAY_SHORT, WEEK_ORDER, capitalise, isEveryDay, type Bin } from "./labels";

export function Swatch({ hex, className }: { hex: string; className?: string }) {
  return (
    <span aria-hidden className={clsx("inline-block size-6 shrink-0 rounded-full border-2 border-line-strong", className)}
      style={{ background: hex }} />
  );
}

/** Week grid: rows = bins (colour swatch + colour name), columns = Monday … Sunday. */
export default function BinWeekTable({ bins, tomorrow }: { bins: Bin[]; tomorrow: number }) {
  return (
    <div className="card overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <caption className="sr-only">Which bin is collected on which day of the week. Tomorrow is {DAY_NAMES[tomorrow]}.</caption>
        <thead>
          <tr className="border-b-2 border-line-strong">
            <th scope="col" className="px-4 py-3 text-base font-bold">Bin</th>
            {WEEK_ORDER.map((d) => (
              <th key={d} scope="col"
                className={clsx("px-2 py-3 text-center text-base font-bold", d === tomorrow && "bg-brand-soft")}>
                <span aria-hidden>{DAY_SHORT[d]}</span>
                <span className="sr-only">{DAY_NAMES[d]}</span>
                {d === tomorrow && <span className="block text-sm font-bold text-brand">Tomorrow</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bins.map((b) => (
            <tr key={b.id} className="border-b border-line">
              <th scope="row" className="px-4 py-3 text-left align-middle font-normal">
                <span className="flex items-center gap-3">
                  <Swatch hex={b.color_hex} />
                  <span>
                    <span className="block font-bold">{b.bin_type}</span>
                    <span className="text-muted">{capitalise(b.color)} bin</span>
                  </span>
                </span>
              </th>
              {isEveryDay(b) ? (
                <td colSpan={7} className="px-2 py-3 text-center align-middle">
                  <span className="inline-flex items-center gap-2 rounded-full bg-ok-soft px-4 py-1 font-bold text-ok">
                    <Check aria-hidden className="size-5" strokeWidth={3} /> Every day
                  </span>
                </td>
              ) : (
                WEEK_ORDER.map((d) => {
                  const yes = (b.weekdays ?? []).includes(d);
                  return (
                    <td key={d} className={clsx("px-2 py-3 text-center align-middle", d === tomorrow && "bg-brand-soft")}>
                      {yes ? (
                        <span className="inline-flex size-9 items-center justify-center rounded-full bg-ok text-white">
                          <Check aria-hidden className="size-6" strokeWidth={3} />
                        </span>
                      ) : (
                        <Minus aria-hidden className="mx-auto size-5 text-line-strong" />
                      )}
                      <span className="sr-only">{yes ? "Yes" : "No"}</span>
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
