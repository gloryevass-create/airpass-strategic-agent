import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAiIssueCandidates } from "@/lib/server/aiIssueCandidates";
import { selectAiIssuesWithAI } from "@/lib/server/aiIssueSelection";
import { todayKstDateStr } from "@/lib/kstDate";

// AI Issue(2026-09-06) — 매일 아침 한 번, news_articles처럼 사용자가 관리하는
// 키워드가 아니라 고정 검색어로 넓게 모은 뒤 Claude가 "이슈"라고 판단한 것만
// 최대 10개 골라 ai_issues에 채워 넣는다(사용자 확인). Vercel Cron이 호출하고,
// Vercel이 자동으로 붙이는 Authorization: Bearer $CRON_SECRET 헤더로만 실행을
// 허용한다(Vercel 공식 권장 패턴) — 다른 어떤 경로로도 이 파이프라인을 채우지
// 않는다(사람이 직접 쓰는 INSERT 정책 자체가 없음, 0059 참고).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const candidates = await fetchAiIssueCandidates();
    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, candidates: 0, note: "후보 없음" });
    }

    const selected = await selectAiIssuesWithAI(candidates);
    if (selected.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, candidates: candidates.length, note: "이슈로 선별된 항목 없음" });
    }

    // issue_date는 DB 컬럼 기본값(current_date, UTC 기준)에 맡기지 않고 여기서
    // 한국시간 날짜로 직접 채운다 — 크론이 UTC 23:00(=KST 다음날 08:00)에 실행돼서
    // DB 기본값을 쓰면 "오늘 아침" 수집분이 "어제" 날짜로 잘못 찍히는 버그가 있었다
    // (2026-09-07 실측 확인).
    const issueDate = todayKstDateStr();

    const admin = createAdminClient();
    const rows = selected.map(({ index, summary }) => {
      const c = candidates[index];
      return {
        title: c.title,
        link: c.link,
        description: c.description,
        summary,
        source_query: c.query,
        published_at: c.publishedAt,
        issue_date: issueDate,
      };
    });

    // link가 unique라 이미 있는(과거에 다른 날 골라진) 기사는 조용히 건너뛴다 —
    // onConflict 없이 batch insert하면 중복 하나 때문에 나머지까지 전부 실패한다.
    const { error, count } = await admin
      .from("ai_issues")
      .upsert(rows, { onConflict: "link", ignoreDuplicates: true, count: "exact" });

    if (error) {
      console.error("[cron/ai-issues] 저장 실패:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, inserted: count ?? rows.length, candidates: candidates.length });
  } catch (e) {
    console.error("[cron/ai-issues] 파이프라인 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
