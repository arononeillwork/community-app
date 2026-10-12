import Link from "next/link";
import { ArrowRight, Building2, Users } from "lucide-react";
import type { Session } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Empty, PageHeader, SectionHeader, TabLinks } from "@/components/ui";
import BlockDirectory from "@/components/people/BlockDirectory";
import { KEY_CONTACT_COLUMNS, KeyContactLine, type KeyContact } from "@/components/people/KeyContactLine";
import { LockedBlock } from "@/components/people/LockedBlock";
import { loadPeople, titlesByPerson } from "@/components/people/data";
import { badgesFor } from "@/components/people/types";

/** Residents: the people of their own block(s) only. Other blocks show their size, nothing more. */
export default async function ResidentMembers({ s, blockId }: { s: Session; blockId?: string }) {
  const supabase = await createClient();
  const c = s.community.id;
  const base = `/${s.community.slug}`;
  const { rows, blocks, units, titles } = await loadPeople(supabase, c);

  const mine = blocks.filter((b) => b.is_mine);
  const others = blocks.filter((b) => !b.is_mine);
  const active = mine.find((b) => b.building_id === blockId) ?? mine[0];

  const { data: reps } = active
    ? await supabase.from("key_contacts").select(KEY_CONTACT_COLUMNS)
        .eq("community_id", c).eq("building_id", active.building_id).order("sort")
    : { data: [] };

  const held = titlesByPerson(titles);
  const people = active ? rows.filter((r) => r.building_id === active.building_id) : [];
  const badges: Record<string, string[]> = {};
  for (const p of people) badges[p.profile_id] = badgesFor(held.get(p.profile_id) ?? [], p.roles, p.building_id);

  const intro = (
    <>You see neighbours in your block. Everyone chooses what they share in <Link href={`${base}/settings`}>Settings</Link>.</>
  );

  return (
    <>
      <PageHeader title="Members" intro={intro} />

      {mine.length > 1 && active && (
        <TabLinks label="Your blocks" tabs={mine.map((b) => ({
          href: `${base}/members?block=${b.building_id}`, label: b.building_name, count: b.people, active: b.building_id === active.building_id,
        }))} />
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {active ? (
            <BlockDirectory
              blockName={active.building_name}
              units={units.filter((u) => u.building_id === active.building_id)}
              people={people}
              badges={badges}
              flatHref={`${base}/members/flat/`}
            />
          ) : (
            <Empty icon={Users} title="You’re not linked to a flat yet"
              action={<Button href={`${base}/contacts`} variant="secondary">Contact the office</Button>}>
              Once the office links you to your flat, your neighbours appear here.
            </Empty>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {active && (reps ?? []).length > 0 && (
            <Card padded={false}>
              <div className="p-5 pb-1 sm:p-6 sm:pb-1">
                <SectionHeader icon={Building2} title={`${active.building_name} contact`} description="Entrance, stairs and lift" />
              </div>
              <ul className="divide-y divide-line">
                {(reps as KeyContact[]).map((k) => <KeyContactLine key={k.id} k={k} stacked className="px-5 py-3 sm:px-6" />)}
              </ul>
              <div className="px-5 pb-5 pt-2 sm:px-6">
                <Link href={`${base}/contacts`} className="inline-flex items-center gap-1 text-sm font-medium no-underline hover:underline">
                  All key contacts <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            </Card>
          )}

          {others.length > 0 && (
            <Card>
              <SectionHeader title="Other blocks" description="Each block sees its own residents." />
              <ul className="flex flex-col gap-2">
                {others.map((b) => <LockedBlock key={b.building_id} b={b} />)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
