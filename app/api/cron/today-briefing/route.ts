import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayIssues } from "@/lib/queries/todayIssue";
import { buildTodayBriefing, TODAY_BRIEFING_MODEL } from "@/lib/server/todayBriefingAi";
import { todayKstDateStr } from "@/lib/kstDate";

// Today Issue(2026-09-17)의 상단 AI 브리핑을 만들어 daily_briefings에 저장한다.
// 하루 3회(08:10·13:10·18:10 KST) 돌면서 같은 날 행을 덮어쓴다(issue_date가 PK).
// ai-issues 크론(0 23 * * * = 08:00 KST)보다 10분 늦게 도는 이유: 그 크론이
// 그날의 ai_issues를 채운 뒤에 읽어야 요약에 AI 이슈가 포함된다.
//
// 화면은 이 테이블에 저장된 문장만 읽는다 — 페이지를 열 때 AI를 호출하지 않아
// 진입이 느려지지 않고, 요약이 아직 없으면 목록만 보여준다.
//
// 인증은 다른 크론들과 같다 — Vercel Cron이 자동으로 붙이는
// Authorization: Bearer $CRON_SECRET 헤더만 허용한다.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const issueDate = todayKstDateStr();

    // includePersonalTodos: false — service_role은 RLS를 우회하므로 이걸 빼지
    // 않으면 팀원 전원의 개인 할 일이 팀 공유 요약에 새어 나간다.
    const data = await getTodayIssues(admin, issueDate, { includePersonalTodos: false });

    const summary = await buildTodayBriefing(data);
    if (!summary) {
      return NextResponse.json({ ok: true, issueDate, saved: false, note: "요약할 항목이 없음" });
    }

    const { error } = await admin.from("daily_briefings").upsert(
      {
        issue_date: issueDate,
        summary,
        model: TODAY_BRIEFING_MODEL,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "issue_date" }
    );
    if (error) throw new Error(`저장 실패: ${error.message}`);

    return NextResponse.json({ ok: true, issueDate, saved: true, length: summary.length });
  } catch (e) {
    console.error("[cron/today-briefing] 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
