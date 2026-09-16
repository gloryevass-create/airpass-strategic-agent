import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getProductCatalog } from "@/lib/queries/productCatalog";
import { getVendors } from "@/lib/queries/vendors";
import { ProductCatalogTable } from "@/components/dashboard/ProductCatalogTable";

export default async function ProductCatalogPage() {
  const { supabase } = await requireAuthedClient();
  const [products, vendors] = await Promise.all([getProductCatalog(supabase), getVendors(supabase)]);

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.5 2.5h5a2 2 0 0 1 2 2v5a2 2 0 0 1-.6 1.4l-9 9a2 2 0 0 1-2.8 0l-5-5a2 2 0 0 1 0-2.8l9-9a2 2 0 0 1 1.4-.6z" />
          <circle cx="16.5" cy="7.5" r="1.5" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>제품 카탈로그</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        에어패스 제품 목록 — 단가·수수료율/마진율·조달 식별정보를 관리합니다. 팀원 누구나 추가·수정할 수
        있습니다.
      </p>

      <ProductCatalogTable
        products={products}
        vendors={vendors.map((v) => ({ id: v.id, companyName: v.companyName }))}
      />
      </div>
    </div>
  );
}
