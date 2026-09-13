import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiToken } from "@/lib/personalApiToken";
import { getTeamEventsV2InRange } from "@/lib/queries/eventsV2";
import { getGoogleCalendarConnection, getMyGoogleCalendarEvents } from "@/lib/queries/googleCalendar";

// 개인 API 토큰(0074)으로 인증하는 외부 캘린더 브리핑 API — Claude 등 외부
// 에이전트가 Authorization: Bearer <토큰>으로 호출하면, 그 토큰을 발급한
// 사용자의 개인 구글 캘린더(연결돼 있으면) + 팀 캘린더(team_events_v2, 팀
// 전체 공유라 필터 없이 전부) 일정을 원본 JSON으로 돌려준다. 세션 쿠키가
// 없는 서버-투-서버 호출이라 proxy.ts PUBLIC_PATHS에도 등록돼 있다 — 이
// 라우트 자체의 토큰 검증이 진짜 인증이다(다른 /api/cron/* 라우트가
// CRON_SECRET을 검증하는 것과 같은 구조, 차이는 팀 공용 시크릿이 아니라
// 사용자별 토큰이라는 점).
//
// 요약·문장 생성은 하지 않는다(사용자 확인, 2026-09-13) — 이 API를 호출하는
// Claude/외부 에이전트가 원본 일정 목록을 보고 알아서 브리핑 문장을 만든다.

function kstDayStartIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString();
}

function kstDayEndIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59+09:00`).toISOString();
}

function todayKstDateStr(): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstNow.toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_RANGE_DAYS = 14;
const MAX_RANGE_DAYS = 90;

function resolveRange(searchParams: URLSearchParams): { rangeStart: string; rangeEnd: string } {
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  if (startParam && endParam) {
    return { rangeStart: kstDayStartIso(startParam), rangeEnd: kstDayEndIso(endParam) };
  }

  const daysParam = Number(searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, MAX_RANGE_DAYS) : DEFAULT_RANGE_DAYS;

  const today = todayKstDateStr();
  return { rangeStart: kstDayStartIso(today), rangeEnd: kstDayEndIso(addDaysToDateStr(today, days - 1)) };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Authorization: Bearer <토큰> 헤더가 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const tokenHash = hashApiToken(token);

  const { data: tokenRow } = await admin
    .from("personal_api_tokens")
    .select("id, user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow) {
    return NextResponse.json({ error: "유효하지 않은 토큰입니다." }, { status: 401 });
  }

  // last_used_at 갱신은 부가 기능이라 실패해도(또는 서버리스 함수가 응답 후
  // 바로 종료돼도) 조회 자체는 막지 않는다 — await로 완료까지는 기다리되
  // 에러만 삼킨다.
  try {
    await admin.from("personal_api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);
  } catch {
    // ignore
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("name, email")
    .eq("id", tokenRow.user_id)
    .maybeSingle();

  const { rangeStart, rangeEnd } = resolveRange(request.nextUrl.searchParams);

  const [teamEvents, googleConnection] = await Promise.all([
    getTeamEventsV2InRange(admin, rangeStart, rangeEnd),
    getGoogleCalendarConnection(admin, tokenRow.user_id),
  ]);

  const googleEvents = googleConnection
    ? await getMyGoogleCalendarEvents(admin, tokenRow.user_id, rangeStart, rangeEnd)
    : [];

  return NextResponse.json({
    user: { name: profile?.name ?? null, email: profile?.email ?? null },
    generatedAt: new Date().toISOString(),
    range: { start: rangeStart, end: rangeEnd },
    personalGoogleCalendar: {
      connected: Boolean(googleConnection),
      googleEmail: googleConnection?.googleEmail ?? null,
      events: googleEvents,
    },
    teamCalendar: {
      events: teamEvents,
    },
  });
}
