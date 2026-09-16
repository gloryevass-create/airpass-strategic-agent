import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getVendors } from "@/lib/queries/vendors";
import { VendorManager } from "@/components/dashboard/VendorManager";

export default async function VendorsPage() {
  const { supabase } = await requireAuthedClient();
  const vendors = await getVendors(supabase);

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
          <path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a1 1 0 0 0 1-1v-3.5" />
          <rect x="14" y="10.5" width="6.5" height="5" rx="1" />
          <circle cx="16.7" cy="13" r=".6" fill="currentColor" stroke="none" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>제조사 관리</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        사업자등록증·통장 사본·명함을 올리면 AI가 업체 정보를 자동으로 읽어 채워줍니다.
      </p>

      <VendorManager vendors={vendors} />
      </div>
    </div>
  );
}
