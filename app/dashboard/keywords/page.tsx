import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getDashboardData } from "@/lib/queries/dashboard";
import { AdAccountStatsPanel } from "@/components/dashboard/AdAccountStatsPanel";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { RankTrendChart } from "@/components/dashboard/RankTrendChart";
import { HotKeywordTreemap } from "@/components/dashboard/HotKeywordTreemap";
import { KeywordTable } from "@/components/dashboard/KeywordTable";
import { AlertsList } from "@/components/dashboard/AlertsList";
import { ReportsList } from "@/components/dashboard/ReportsList";

type SearchParams = Promise<{ statsFrom?: string; statsTo?: string }>;

export default async function KeywordsPage({ searchParams }: { searchParams: SearchParams }) {
  const { statsFrom, statsTo } = await searchParams;
  const { supabase } = await requireAuthedClient();
  const dashboard = await getDashboardData(supabase, {
    accountStatsSince: statsFrom,
    accountStatsUntil: statsTo,
  });

  const keywordReports = dashboard.reports.filter((r) => r.track !== "blog");

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="marketing-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>네이버키워드</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        네이버 검색광고 키워드 실적과 경쟁사 대비 노출순위를 모니터링합니다.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        {!dashboard.latestDate && (
          <div className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
            <p style={{ margin: 0, fontSize: 13 }} className="text-muted">
              아직 모니터링 에이전트가 수집한 데이터가 없습니다. 파이프라인이 최소 1회 실행되면 여기에
              결과가 표시됩니다.
            </p>
          </div>
        )}

        <AdAccountStatsPanel data={dashboard.adAccountStats} />

        <KpiCards kpi={dashboard.kpi} />

        <section className="two-col-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
          <div className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
            <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-3-3-4 4" />
              </svg>
              키워드 평균 노출순위 추이 (최근 14일)
            </h2>
            <RankTrendChart data={dashboard.rankTrend} />
          </div>
          <div className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
            <HotKeywordTreemap keywordTable={dashboard.keywordTable} />
          </div>
        </section>

        <section>
          <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            키워드별 상세
          </h2>
          <KeywordTable data={dashboard.keywordTable} />
        </section>

        <section className="two-col-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
          <div>
            <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              이상 징후 알림
            </h2>
            <AlertsList data={dashboard.alerts} />
          </div>
          <div>
            <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              최근 리포트
            </h2>
            <ReportsList data={keywordReports} />
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}
