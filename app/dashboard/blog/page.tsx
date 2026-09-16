import "@/components/industryTheme.css";
import { Suspense } from "react";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getDashboardData, type DashboardData } from "@/lib/queries/dashboard";
import { getActiveCompetitors } from "@/lib/queries/competitors";
import { getKeywordStrategyComment } from "@/lib/blogKeywordStrategyAi";
import { SovTrendChart } from "@/components/dashboard/SovTrendChart";
import { CadenceTable } from "@/components/dashboard/CadenceTable";
import { ContentMatchedKeywordTable } from "@/components/dashboard/ContentMatchedKeywordTable";
import { AiKeywordStrategyComment } from "@/components/dashboard/AiKeywordStrategyComment";
import { ReportsList } from "@/components/dashboard/ReportsList";
import { CompetitorBlogManager } from "@/components/dashboard/CompetitorBlogManager";

// AI 키워드 전략 코멘트는 실제로 Claude를 호출해서 1~2초 이상 걸린다 — 페이지 전체를
// 기다리게 하지 않도록 별도 컴포넌트로 분리해 Suspense로 스트리밍한다.
async function KeywordStrategySection({
  sov,
  contentMatchedKeywords,
}: {
  sov: DashboardData["sov"];
  contentMatchedKeywords: DashboardData["contentMatchedKeywords"];
}) {
  const comment = await getKeywordStrategyComment(
    sov.map((s) => ({ competitorName: s.competitorName, sharePct: s.sharePct })),
    contentMatchedKeywords.map((k) => ({ keyword: k.keyword, matchCount: k.matchCount }))
  );
  return <AiKeywordStrategyComment comment={comment} />;
}

function KeywordStrategySkeleton() {
  return (
    <div className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
      <h2 style={{ margin: "0 0 var(--space-2)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.6 4.9L18.5 9l-4.9 1.6L12 15.5l-1.6-4.9L5.5 9l4.9-1.6L12 3z" />
        </svg>
        AI 키워드 전략 코멘트
      </h2>
      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        AI가 분석 중입니다...
      </p>
    </div>
  );
}

export default async function BlogPage() {
  const { supabase } = await requireAuthedClient();
  const [dashboard, competitors] = await Promise.all([
    getDashboardData(supabase),
    getActiveCompetitors(supabase),
  ]);

  const blogReports = dashboard.reports.filter((r) => r.track !== "ad");

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="marketing-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>네이버블로그</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        경쟁사 블로그 포스팅 현황과 콘텐츠 노출 점유율(SOV)을 모니터링합니다.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <CompetitorBlogManager competitors={competitors} path="/dashboard/blog" />
        {!dashboard.latestDate && (
          <div className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
            <p style={{ margin: 0, fontSize: 13 }} className="text-muted">
              아직 모니터링 에이전트가 수집한 데이터가 없습니다. 파이프라인이 최소 1회 실행되면 여기에
              결과가 표시됩니다.
            </p>
          </div>
        )}

        <section className="two-col-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
          <div className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
            <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                <path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg>
              블로그 노출 점유율 (SOV) — 최근 14일 추이
            </h2>
            <SovTrendChart data={dashboard.sovTrend} />
          </div>
          <div className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
            <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="17" rx="0" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="7" y1="2" x2="7" y2="5" />
                <line x1="17" y1="2" x2="17" y2="5" />
              </svg>
              블로그 포스팅 주기
            </h2>
            <CadenceTable data={dashboard.cadence} />
            <p className="text-muted" style={{ margin: "var(--space-2) 0 0", fontSize: 11 }}>
              * 에어패스 자체 블로그를 포함합니다. 총 게시물 수는 모니터링을 시작한 이후 누적 수집된
              건수입니다.
            </p>
          </div>
        </section>

        <section>
          <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            콘텐츠 매칭 키워드 (경쟁사 게시물과 겹치는 주요 키워드 TOP 20)
          </h2>
          <ContentMatchedKeywordTable data={dashboard.contentMatchedKeywords} />
          <p className="text-muted" style={{ margin: "var(--space-2) 0 0", fontSize: 11 }}>
            * 실제 수집된 경쟁사·에어패스 게시물 제목에 등장하는 단어와 겹치는 등록 키워드만 모아
            제목 매칭 건수 기준 상위 10개를 표시합니다. CPC는 계정의 biz channel 연동 전이라 아직
            채워지지 않았습니다. &ldquo;경쟁사별 이 키워드 광고 여부&rdquo;는 네이버가 제3자에게
            공개하지 않는 정보라 표시하지 않습니다.
          </p>
        </section>

        <Suspense fallback={<KeywordStrategySkeleton />}>
          <KeywordStrategySection sov={dashboard.sov} contentMatchedKeywords={dashboard.contentMatchedKeywords} />
        </Suspense>

        <section>
          <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            최근 리포트
          </h2>
          <ReportsList data={blogReports} />
        </section>
      </div>
      </div>
    </div>
  );
}
