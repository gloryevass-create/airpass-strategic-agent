import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Client = SupabaseClient<Database>;

export type TeamEventV2 = {
  id: string;
  title: string;
  dateStart: string;
  dateEnd: string | null;
  isDatetime: boolean;
  category: string | null;
  tags: string[];
  target: string | null;
  location: string | null;
  content: string | null;
  assignees: string[];
  attendees: string[];
  googleEventId: string | null;
  googleEventOwnerId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** month("YYYY-MM")를 포함하는, 앞뒤 캘린더 그리드에 걸치는 며칠까지 넉넉하게
 * 담는 범위. 구글 캘린더 일정을 같은 화면에 같이 보여줄 때도 정확히 같은
 * 범위를 써야 그리드 경계에서 어긋나지 않는다(app/dashboard/calendar/page.tsx). */
export function eventsV2RangeForMonth(month: string): { rangeStart: string; rangeEnd: string } {
  const [year, mon] = month.split("-").map(Number);
  return {
    rangeStart: new Date(Date.UTC(year, mon - 2, 21)).toISOString(),
    rangeEnd: new Date(Date.UTC(year, mon, 10)).toISOString(),
  };
}

/**
 * team_events_v2는 이 대시보드가 직접 쓰는(Notion 연동 없는) 일정 데이터라
 * admin 캐싱 없이 요청자의 세션 클라이언트로 매번 최신값을 읽는다
 * (product_catalog/business_projects_v2와 동일한 패턴).
 */
export async function getTeamEventsV2(supabase: Client, month: string): Promise<TeamEventV2[]> {
  const { rangeStart, rangeEnd } = eventsV2RangeForMonth(month);
  return getTeamEventsV2InRange(supabase, rangeStart, rangeEnd);
}

/** month 그리드가 아니라 임의의 [rangeStart, rangeEnd) 구간으로 조회할 때 쓴다
 * (외부 캘린더 브리핑 API, app/api/calendar-feed/route.ts) — 필터링 로직은
 * getTeamEventsV2와 동일, 범위만 호출부가 직접 정한다. */
export async function getTeamEventsV2InRange(
  supabase: Client,
  rangeStart: string,
  rangeEnd: string
): Promise<TeamEventV2[]> {
  const { data } = await supabase
    .from("team_events_v2")
    .select("*")
    .lte("date_start", rangeEnd)
    .or(`date_end.gte.${rangeStart},date_end.is.null`)
    .order("date_start", { ascending: true });

  return (data ?? [])
    .filter((e) => e.date_start >= rangeStart || (e.date_end != null && e.date_end >= rangeStart))
    .map((e) => ({
      id: e.id,
      title: e.title,
      dateStart: e.date_start,
      dateEnd: e.date_end,
      isDatetime: e.is_datetime,
      category: e.category,
      tags: e.tags,
      target: e.target,
      location: e.location,
      content: e.content,
      assignees: e.assignees,
      attendees: e.attendees,
      googleEventId: e.google_event_id,
      googleEventOwnerId: e.google_event_owner_id,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));
}
