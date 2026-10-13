import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, MailOpen } from "lucide-react";
import { getCommunityOr404 } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Notice, buttonClass } from "@/components/ui";
import { date } from "@/lib/format";
import { acceptInvitations, declineInvitations } from "./actions";

export const metadata = { title: "Your invitation" };

type Invitation = {
  id: string; community_name: string; role: string; unit_label: string | null; building_name: string | null;
  tenancy_type: string | null; start_date: string | null; end_date: string | null; invited_by_name: string | null;
};

const ROLE_WORDS: Record<string, string> = { owner: "Owner", tenant: "Resident", treasurer: "Treasurer", admin: "Administrator" };

function describe(i: Invitation) {
  const flat = i.unit_label ? `flat ${i.unit_label}${i.building_name ? `, ${i.building_name}` : ""}` : null;
  if (i.role === "owner") return `Owner of ${flat}`;
  if (i.role === "tenant") {
    const from = i.start_date ? ` from ${date(i.start_date)}` : "";
    const until = i.end_date ? ` until ${date(i.end_date)}` : "";
    return `Living in ${flat}${from}${until}`;
  }
  return ROLE_WORDS[i.role] ?? i.role;
}

/** Where invited people accept (or decline) joining a community. Nobody is added without this step. */
export default async function JoinPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ error?: string; declined?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const c = await getCommunityOr404(community);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${c.slug}/login?next=${encodeURIComponent(`/${c.slug}/join`)}`);

  const { data } = await supabase.rpc("my_invitations", { c: c.id });
  const invitations = (data ?? []) as Invitation[];
  if (invitations.length === 0 && !sp.declined && !sp.error) {
    const { count } = await supabase.from("memberships").select("id", { count: "exact", head: true })
      .eq("community_id", c.id).eq("profile_id", user.id).eq("status", "active");
    if (count) redirect(`/${c.slug}/home`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: "radial-gradient(90% 60% at 50% 0%, var(--brand-soft), var(--bg) 70%)" }}>
      <div className="w-full max-w-[28rem]">
        <div className="card rounded-[20px] border border-line bg-surface p-6 shadow-pop sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            {c.branding?.logo_url
              ? <img src={c.branding.logo_url} alt="" className="size-14 rounded-2xl" />
              : <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-text"><MailOpen aria-hidden className="size-6" /></span>}
            <div>
              <h1 className="text-[1.5rem] font-semibold leading-tight">
                {invitations.length ? `Join ${c.name}` : "No open invitation"}
              </h1>
              <p className="mt-1 text-[0.9375rem] text-muted">
                {invitations.length
                  ? `${invitations[0].invited_by_name ?? "The office"} has invited you to the community app.`
                  : sp.declined ? "You declined the invitation. The office can invite you again if needed."
                  : "There is no invitation waiting for this account. If you expected one, ask the office to send it again."}
              </p>
            </div>
          </div>

          {sp.error && <div className="mb-4"><Notice tone="bad">That invitation is no longer open. Ask the office to send a new one.</Notice></div>}

          {invitations.length > 0 && (
            <>
              <ul className="mb-6 flex flex-col gap-2">
                {invitations.map((i) => (
                  <li key={i.id} className="rounded-xl bg-surface-2 px-4 py-3 text-[0.9375rem] text-ink">{describe(i)}</li>
                ))}
              </ul>
              <p className="mb-5 text-sm text-muted">
                When you join, your name and flat appear to neighbours in your block. You choose who sees your phone and email in Settings.
              </p>
              <div className="flex flex-col gap-2">
                <form action={acceptInvitations.bind(null, c.slug)}>
                  <button type="submit" className={buttonClass("primary", "lg", "w-full")}>Accept and continue</button>
                </form>
                <form action={declineInvitations.bind(null, c.slug)}>
                  <button type="submit" className={buttonClass("ghost", "md", "w-full")}>No thanks</button>
                </form>
              </div>
            </>
          )}
        </div>
        <p className="mt-5 text-center">
          <Link href={`/${c.slug}`} className="inline-flex items-center gap-1 text-[0.9375rem] font-medium text-muted no-underline hover:text-ink">
            <ChevronLeft aria-hidden className="size-4" /> {c.name}
          </Link>
        </p>
      </div>
    </main>
  );
}
