import { requireFinance } from "@/lib/community";
import FinanceNav from "@/components/finance/FinanceNav";

/** Every finance page: treasurers and administrators only, with the section tabs on top (as in Administration). */
export default async function FinanceLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ community: string }>;
}) {
  const { community } = await params;
  const s = await requireFinance(community);
  return (
    <>
      <FinanceNav slug={s.community.slug} />
      {children}
    </>
  );
}
