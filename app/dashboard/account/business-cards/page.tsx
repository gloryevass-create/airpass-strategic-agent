import "@/components/industryTheme.css";
import Link from "next/link";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getBusinessCards, type BusinessCardSort } from "@/lib/queries/businessCards";
import { BusinessCardBoard } from "@/components/dashboard/BusinessCardBoard";

/** 리멤버 명함첩 — 개인 데이터라 헤더의 개인 메뉴 아래(회원정보 수정·비밀번호
 * 변경과 같은 자리)에 둔다. 사이드바에 넣지 않은 이유도 같다: 팀이 함께 보는
 * 메뉴가 아니다. */
export default async function BusinessCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string; page?: string; sort?: string }>;
}) {
  const { supabase } = await requireAuthedClient();
  const params = await searchParams;
  const sort: BusinessCardSort = params.sort === "name" ? "name" : "registered";
  const list = await getBusinessCards(supabase, {
    search: params.q,
    group: params.group,
    page: Number(params.page) || 1,
    sort,
  });

  return (
    <div className="industry-theme board-page-content" style={{ padding: "var(--space-8) var(--space-6)", minHeight: "auto" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link
          href="/dashboard/calendar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--color-accent-700)",
            fontSize: 13,
            textDecoration: "none",
            marginBottom: "var(--space-5)",
          }}
        >
          ← 대시보드
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="5" width="19" height="14" rx="1" />
            <circle cx="8" cy="11" r="2" />
            <path d="M4.8 16.2a3.6 3.6 0 0 1 6.4 0M14 10h5M14 14h3" />
          </svg>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>
            리멤버 명함
          </h1>
        </div>
        <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
          리멤버에서 내려받은 명함첩 CSV를 올려 보관합니다. <strong>본인만 볼 수 있습니다</strong> — 관리자도 다른 사람의 명함첩은 볼 수 없습니다.
        </p>

        <BusinessCardBoard
          cards={list.cards}
          matched={list.matched}
          total={list.total}
          groups={list.groups}
          ungrouped={list.ungrouped}
          page={list.page}
          pageCount={list.pageCount}
          search={params.q ?? ""}
          group={params.group ?? ""}
          sort={sort}
        />
      </div>
    </div>
  );
}
