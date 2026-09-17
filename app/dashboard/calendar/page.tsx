import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getTeamEventsV2, eventsV2RangeForMonth } from "@/lib/queries/eventsV2";
import { getTeamMemberNames } from "@/lib/queries/teamMembers";
import { getGoogleCalendarConnection, getMyGoogleCalendarEvents } from "@/lib/queries/googleCalendar";
import { IndustryEventCalendar } from "@/components/dashboard/IndustryEventCalendar";
import { todayKstDateStr } from "@/lib/kstDate";

type SearchParams = Promise<{ month?: string; day?: string; eventId?: string; googleConnected?: string; googleError?: string }>;

// Vercel 서버는 UTC로 돈다 — new Date()의 로컬 게터(getFullYear/getMonth 등)를
// 그대로 쓰면 한국 자정~오전 9시 사이에는 하루/한 달 전 값이 나와 캘린더 기본
// 진입 월·오늘 표시가 어긋난다(2026-09-16, 사용자 확인). KST 날짜 계산은
// lib/kstDate.ts로 모아뒀다.
function currentDay() {
  return todayKstDateStr();
}

function currentMonth() {
  return currentDay().slice(0, 7);
}

export default async function Events2Page({ searchParams }: { searchParams: SearchParams }) {
  const { month: monthParam, day: dayParam, eventId, googleConnected, googleError } = await searchParams;
  const month = monthParam ?? currentMonth();
  const day = dayParam ?? (month === currentMonth() ? currentDay() : `${month}-01`);
  const { supabase, user } = await requireAuthedClient();
  const { rangeStart, rangeEnd } = eventsV2RangeForMonth(month);

  const [events, members, googleConnection, googleEvents] = await Promise.all([
    getTeamEventsV2(supabase, month),
    getTeamMemberNames(supabase),
    getGoogleCalendarConnection(supabase, user.id),
    getMyGoogleCalendarEvents(supabase, user.id, rangeStart, rangeEnd),
  ]);

  return (
    <IndustryEventCalendar
      events={events}
      month={month}
      initialCursor={day}
      initialEventId={eventId ?? null}
      members={members}
      currentUserId={user.id}
      googleConnection={googleConnection}
      googleEvents={googleEvents}
      googleConnected={googleConnected === "1"}
      googleError={googleError ?? null}
    />
  );
}
