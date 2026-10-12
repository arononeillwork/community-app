import Link from "next/link";
import { Pencil } from "lucide-react";
import { IconButton } from "@/components/ui";
import { pct } from "./format";

type Person = { id: string; name: string };
export type FlatsTableRow = {
  id: string; label: string; floor: number | null; bedrooms: number | null; coefficient: number; owners: Person[]; tenants: Person[];
};

function floorName(f: number | null) {
  if (f == null) return "–";
  return f === 0 ? "Ground" : String(f);
}

function People({ people, slug, empty }: { people: Person[]; slug: string; empty: string }) {
  if (!people.length) return <span className="text-muted">{empty}</span>;
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link href={`/${slug}/admin/people/${p.id}`} className="text-ink-2 no-underline hover:text-brand-text hover:underline">{p.name}</Link>
        </span>
      ))}
    </>
  );
}

/**
 * The flats of one block. A compact table on wider screens and a list of cards on phones.
 * Flat names open the flat page; the pencil opens the edit form.
 */
export default function FlatsTable({ flats, slug }: { flats: FlatsTableRow[]; slug: string }) {
  const editLabel = (f: FlatsTableRow) => `Edit flat ${f.label}`;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-surface-2">
            <tr className="border-y border-line text-[0.8125rem] text-muted">
              <th scope="col" className="w-[13%] px-5 py-2 font-medium sm:pl-6">Flat</th>
              <th scope="col" className="w-[9%] px-3 py-2 text-right font-medium">Floor</th>
              <th scope="col" className="w-[12%] px-3 py-2 text-right font-medium">Bedrooms</th>
              <th scope="col" className="w-[12%] px-3 py-2 text-right font-medium">Share</th>
              <th scope="col" className="px-3 py-2 pl-6 font-medium">Owner</th>
              <th scope="col" className="px-3 py-2 font-medium">Tenant</th>
              <th scope="col" className="w-16 py-2 pr-4"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody>
            {flats.map((f) => (
              <tr key={f.id} className="border-b border-line text-[0.9375rem] text-ink-2 last:border-0 hover:bg-surface-2/70">
                <td className="px-5 py-2.5 sm:pl-6">
                  <Link href={`/${slug}/members/flat/${f.id}`} className="font-medium no-underline hover:underline">{f.label}</Link>
                </td>
                <td className="tabular px-3 py-2.5 text-right">{floorName(f.floor)}</td>
                <td className="tabular px-3 py-2.5 text-right">{f.bedrooms ?? "–"}</td>
                <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">{pct(f.coefficient)}</td>
                <td className="px-3 py-2.5 pl-6"><People people={f.owners} slug={slug} empty="No owner" /></td>
                <td className="px-3 py-2.5"><People people={f.tenants} slug={slug} empty="–" /></td>
                <td className="py-1 pr-4 text-right"><IconButton icon={Pencil} label={editLabel(f)} href={`/${slug}/admin/blocks/flats/${f.id}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line border-t border-line md:hidden">
        {flats.map((f) => (
          <li key={f.id} className="flex items-start gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/${slug}/members/flat/${f.id}`} className="font-medium no-underline hover:underline">{f.label}</Link>
                <span className="text-sm text-muted">
                  Floor {floorName(f.floor).toLowerCase()} · {f.bedrooms ?? "–"} bed · {pct(f.coefficient)}
                </span>
              </div>
              <div className="mt-0.5 text-[0.9375rem] text-ink-2">
                <People people={f.owners} slug={slug} empty="No owner" />
                {f.tenants.length > 0 && <> <span className="text-muted">· rented to</span> <People people={f.tenants} slug={slug} empty="" /></>}
              </div>
            </div>
            <IconButton icon={Pencil} label={editLabel(f)} href={`/${slug}/admin/blocks/flats/${f.id}`} />
          </li>
        ))}
      </ul>
    </>
  );
}
