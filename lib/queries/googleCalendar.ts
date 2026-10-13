import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { refreshAccessToken } from "@/lib/googleCalendar/oauth";
import { fetchGoogleCalendarEvents, type GoogleCalendarEvent } from "@/lib/googleCalendar/api";

type Client = SupabaseClient<Database>;

export type GoogleCalendarConnection = { googleEmail: string; connectedAt: string };

export async function getGoogleCalendarConnection(
  supabase: Client,
  userId: string
): Promise<GoogleCalendarConnection | null> {
  const { data } = await supabase
    .from("google_calendar_connections")
    .select("google_email, connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { googleEmail: data.google_email, connectedAt: data.connected_at };
}

/** refresh_token 자체가 더는 쓸 수 없게 된 경우 구글은 `invalid_grant`로 답한다
 * (사용자가 구글 계정 설정에서 앱 접근을 취소했거나, **OAuth 동의 화면이
 * "테스트" 상태면 발급 7일 뒤 자동 만료**된다). 비밀번호 변경·일시적 장애 같은
 * 다른 실패와 구분해야 화면에 "다시 연결하세요"를 띄울 수 있다. */
function isAuthRevoked(e: unknown): boolean {
  return e instanceof Error && e.message.includes("invalid_grant");
}

export type GoogleTokenResult = {
  token: string | null;
  /** refresh_token이 폐기·만료돼 재연결 외에는 방법이 없는 상태 */
  authRevoked: boolean;
};

/** 연결된 구글 계정의 access_token을 돌려준다(없거나 곧 만료되면 refresh_token으로
 * 새로 받아 DB 캐시도 같이 갱신). */
export async function resolveGoogleAccessToken(supabase: Client, userId: string): Promise<GoogleTokenResult> {
  const { data: conn } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) return { token: null, authRevoked: false };

  let accessToken = conn.access_token;
  const expiresSoon =
    !conn.access_token_expires_at || new Date(conn.access_token_expires_at).getTime() < Date.now() + 60_000;

  if (!accessToken || expiresSoon) {
    try {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabase
        .from("google_calendar_connections")
        .update({ access_token: accessToken, access_token_expires_at: expiresAt })
        .eq("user_id", userId);
    } catch (e) {
      console.error("[resolveGoogleAccessToken] 토큰 갱신 실패:", e instanceof Error ? e.message : e);
      return { token: null, authRevoked: isAuthRevoked(e) };
    }
  }

  return { token: accessToken, authRevoked: false };
}

/** 토큰만 필요한 호출부(일정 등록/수정/삭제의 구글 동기화)를 위한 얇은 래퍼 —
 * 그쪽은 실패해도 조용히 건너뛰므로 사유를 구분할 필요가 없다. */
export async function getValidGoogleAccessToken(supabase: Client, userId: string): Promise<string | null> {
  return (await resolveGoogleAccessToken(supabase, userId)).token;
}

export type GoogleCalendarFetch = {
  events: GoogleCalendarEvent[];
  /** true면 연결 행은 남아 있지만 구글이 토큰을 거부한 상태 — 화면에서
   * "연결됨"으로만 보여주면 일정이 조용히 사라진 것처럼 보인다(2026-10-13
   * 사용자 제보: "해지한 적 없는데 해지됨"). */
  authRevoked: boolean;
};

/** 연결돼 있으면 그 사용자의 구글 캘린더 일정을 가져온다. 구글 쪽 요청이
 * 실패해도 빈 배열을 돌려준다 — 이 기능이 실패했다고 캘린더 화면 전체가
 * 막히면 안 되기 때문이다. 다만 **토큰이 폐기된 경우만은 조용히 넘기지 않고**
 * authRevoked로 알려서 화면이 재연결을 안내할 수 있게 한다. */
export async function getMyGoogleCalendarEvents(
  supabase: Client,
  userId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<GoogleCalendarFetch> {
  const { token, authRevoked } = await resolveGoogleAccessToken(supabase, userId);
  if (!token) return { events: [], authRevoked };

  try {
    return { events: await fetchGoogleCalendarEvents(token, rangeStart, rangeEnd), authRevoked: false };
  } catch (e) {
    console.error("[getMyGoogleCalendarEvents] 일정 조회 실패:", e instanceof Error ? e.message : e);
    return { events: [], authRevoked: false };
  }
}
