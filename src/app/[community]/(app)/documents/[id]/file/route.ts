import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE, fileExtension, safeFileName } from "@/components/library/meta";

/**
 * Open or download a document's file: a short-lived signed link from the private "documents" bucket.
 * The document row and the file are both read as the signed-in user, so RLS decides who may open it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ community: string; id: string }> }) {
  const { community, id } = await params;
  const s = await requireMember(community);
  if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("title, storage_path")
    .eq("id", id).eq("community_id", s.community.id).maybeSingle();
  if (!doc?.storage_path) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const ext = fileExtension(doc.storage_path);
  const { data } = await supabase.storage.from("documents")
    .createSignedUrl(doc.storage_path, 300, download ? { download: safeFileName(`${doc.title}.${ext}`) } : undefined);
  // The row is visible but the file cannot be signed (missing object, storage hiccup): explain it on the document page.
  if (!data?.signedUrl) return NextResponse.redirect(new URL(`/${s.community.slug}/documents/${id}?file=missing`, request.url), 303);

  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "no-store" } });
}
