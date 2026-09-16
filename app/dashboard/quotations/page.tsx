import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getQuotations, getBusinessProjectOptions } from "@/lib/queries/quotations";
import { getTeamMemberNames } from "@/lib/queries/teamMembers";
import { getProductCatalog } from "@/lib/queries/productCatalog";
import { QuotationBoard } from "@/components/dashboard/QuotationBoard";

export default async function QuotationsPage() {
  const { supabase } = await requireAuthedClient();
  const [quotations, members, products, businessProjects] = await Promise.all([
    getQuotations(supabase),
    getTeamMemberNames(supabase),
    getProductCatalog(supabase),
    getBusinessProjectOptions(supabase),
  ]);

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12v17.5l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 20.5z" />
          <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>산출내역 작성·보관</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        제품 카탈로그 정보로 산출내역을 작성·수정·삭제하고 인쇄용 화면으로 출력합니다.
      </p>
      <QuotationBoard quotations={quotations} members={members} products={products} businessProjects={businessProjects} />
      </div>
    </div>
  );
}
