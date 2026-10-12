import { requireMember } from "@/lib/community";
import AdminMembers from "./AdminMembers";
import ResidentMembers from "./ResidentMembers";

export const metadata = { title: "Members" };

export default async function MembersPage({ params, searchParams }: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ block?: string; view?: string }>;
}) {
  const { community } = await params;
  const sp = await searchParams;
  const s = await requireMember(community);
  return s.isAdmin
    ? <AdminMembers s={s} view={sp.view === "list" ? "list" : "blocks"} blockId={sp.block} />
    : <ResidentMembers s={s} blockId={sp.block} />;
}
