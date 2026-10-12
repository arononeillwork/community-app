import { requireFinance } from "@/lib/community";
import { PageHeader } from "@/components/ui";
import FinanceNav from "@/components/finance/FinanceNav";

export default async function FinanceLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ community: string }>;
}) {
  const { community } = await params;
  const s = await requireFinance(community);
  return (
    <>
      <PageHeader title="Finance" intro="Spending, suppliers, contracts and owner fees." />
      <FinanceNav slug={s.community.slug} />
      {children}
    </>
  );
}
