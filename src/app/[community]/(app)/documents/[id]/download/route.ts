import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { safeFileName } from "@/components/info/labels";

export const dynamic = "force-dynamic";

/**
 * GET /<community>/documents/<id>/download[?view=1]
 * Checks membership, then that the document is visible to this person (RLS on documents),
 * and redirects to a short-lived signed URL in the private "documents" bucket.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireMember(community); // redirects to the login page if not signed in / not a member
  const supabase = await createClient();
  const base = `/${s.community.slug}/documents`;

  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, storage_path")
    .eq("id", id)
    .eq("community_id", s.community.id)
    .maybeSingle();

  if (!doc) return noStore(NextResponse.redirect(new URL(base, request.url), 303));
  const path = doc.storage_path as string | null;
  // Only files stored under this community's folder are served.
  if (!path || !path.startsWith(`${s.community.id}/`)) {
    return noStore(NextResponse.redirect(new URL(`${base}/${doc.id}`, request.url), 303));
  }

  const view = request.nextUrl.searchParams.get("view") === "1";
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
  const downloadName = safeFileName(String(doc.title)) + (ext && !String(doc.title).toLowerCase().endsWith(ext) ? ext : "");

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 60, view ? undefined : { download: downloadName });
  if (error || !data?.signedUrl) {
    return noStore(NextResponse.redirect(new URL(`${base}/${doc.id}?error=file`, request.url), 303));
  }
  return noStore(NextResponse.redirect(data.signedUrl, 303));
}

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
