import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getTodayIssues } from "@/lib/queries/todayIssue";
import { todayKstDateStr } from "@/lib/kstDate";
import { TodayIssueBoard } from "@/components/dashboard/TodayIssueBoard";

// Today Issue(2026-09-17) — 어제 무슨 일이 있었고, 오늘 뭐가 있고, 내일 뭘
// 준비해야 하는지를 한 화면에서 보는 브리핑. 기능이 늘면서 Calendar·3개 보드·
// 영업지원·기록·AI HUB를 하나씩 돌아야 알 수 있던 것을 모았다(사용자 요청).
//
// 기준일은 항상 **한국시간** 오늘이다 — 서버(Vercel)는 UTC로 돌아서 new Date()의
// 로컬 값을 쓰면 KST 자정~오전 9시에 하루가 밀린다(lib/kstDate.ts 주석 참고).
export default async function TodayIssuePage() {
  const { supabase } = await requireAuthedClient();
  const data = await getTodayIssues(supabase, todayKstDateStr());

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1100, margin: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v3" />
            <path d="M4.9 6.9 7 9" />
            <path d="M2 14h3" />
            <path d="M19 14h3" />
            <path d="m17 9 2.1-2.1" />
            <path d="M7 18a5 5 0 0 1 10 0z" />
            <path d="M4 22h16" />
          </svg>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>
            Today Issue
          </h1>
        </div>
        <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
          캘린더 일정과 각 보드·영업지원의 변동을 어제/오늘/내일로 모아 봅니다.
        </p>

        <TodayIssueBoard data={data} />
      </div>
    </div>
  );
}
