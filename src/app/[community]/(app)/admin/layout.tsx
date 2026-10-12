import { requireAdmin } from "@/lib/community";
import AdminNav from "@/components/admin/AdminNav";

/** Every administration page: administrators only, with the section tabs on top. */
export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ community: string }> }) {
  const { community } = await params;
  const s = await requireAdmin(community);
  return (
    <>
      <AdminNav slug={s.community.slug} />
      {children}
    </>
  );
}
