"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMember } from "@/lib/formatMember";
import { getValidGoogleAccessToken } from "@/lib/queries/googleCalendar";
import { insertGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from "@/lib/googleCalendar/api";

const PATH = "/dashboard/calendar";

// 일정 등록/수정 체감 속도 개선(2026-09-17, 사용자 요청) — "저장"을 누른 뒤
// 다이얼로그가 닫히기까지 걸리는 시간은 서버 액션이 끝날 때까지의 왕복 지연
// 전체다. 예전엔 팀 알림 생성(profiles 조회 + notifications insert)과 구글
// 캘린더 동기화(토큰 조회/갱신 + 구글 API 호출 + 후속 update)까지 전부 그
// 안에서 순차로 처리해서, 실측으로 Supabase 왕복 1회당 80~250ms · 구글 API는
// 그보다 더 걸리는 상황에서 5~6번을 줄줄이 기다려야 했다. 이 부수 효과들은
// 모두 "실패해도 일정 저장 자체는 성공"으로 이미 취급하던 것들이라
// Next 16의 after()로 응답 이후로 미뤘다 — 사용자가 기다리는 구간은
// 인증 + insert/update 두 번의 왕복만 남는다.
//
// after() 안에서는 요청 세션 클라이언트를 쓰지 않는다 — 응답이 끝난 뒤라
// @supabase/ssr이 갱신된 세션 쿠키를 다시 쓸 수 없고(쿠키 쓰기 시점이 지남),
// notifications insert처럼 RLS만 통과하면 되는 작업은 service_role로 하는 게
// 안전하다. 대신 "누가" 하는 작업인지는 항상 응답 전에 확인한 user.id로만
// 판단한다(권한 판단을 admin 클라이언트에 맡기지 않는다).

// 알림 링크에 그 일정이 속한 월/날짜를 함께 실어 보내려고 KST 날짜 문자열로
// 바꾼다(2026-09-16) — date_start는 UTC ISO라 그대로 slice하면 하루 밀릴 수
// 있다(Calendar "오늘" 표시 버그와 같은 원인, components/dashboard/
// IndustryEventCalendar.tsx::toKstDateStr 참고).
function kstDateStrFromIso(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type TeamEventV2FormState = { error?: string } | undefined;

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function listFromForm(formData: FormData, key: string): string[] {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// MemberMultiSelect(담당자/참석자)는 같은 name으로 여러 값을 제출하므로 getAll로
// 받는다 — 태그는 여전히 자유 텍스트라 listFromForm(쉼표 파싱)을 그대로 쓴다
// (예전 "쉼표로 구분" 자유 텍스트 입력을 실제 팀원 선택으로 대체, 2026-08-23).
function memberListFromForm(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

// <input type="datetime-local">가 주는 "YYYY-MM-DDTHH:mm"에는 타임존 정보가 없다 —
// 브라우저에서는 사용자의 로컬 시간(KST)로 보이지만, new Date(문자열)을 서버(Vercel,
// UTC)에서 그대로 파싱하면 서버 로컬시간(UTC)으로 잘못 해석돼 9시간이 밀린다. 이 앱은
// 항상 KST 기준이므로 명시적으로 +09:00을 붙여 파싱한다.
function kstLocalToIso(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}

function fieldsFromForm(formData: FormData) {
  const dateStart = String(formData.get("dateStart") ?? "").trim();
  const dateEnd = String(formData.get("dateEnd") ?? "").trim();
  return {
    title: text(formData, "title") ?? "",
    date_start: dateStart ? kstLocalToIso(dateStart) : "",
    date_end: dateEnd ? kstLocalToIso(dateEnd) : null,
    is_datetime: formData.get("isDatetime") === "on",
    category: text(formData, "category"),
    tags: listFromForm(formData, "tags"),
    target: text(formData, "target"),
    location: text(formData, "location"),
    content: text(formData, "content"),
    assignees: memberListFromForm(formData, "assignees"),
    attendees: memberListFromForm(formData, "attendees"),
  };
}

function googleEventInputFrom(fields: ReturnType<typeof fieldsFromForm>) {
  return {
    title: fields.title,
    dateStart: fields.date_start,
    dateEnd: fields.date_end,
    isDatetime: fields.is_datetime,
    location: fields.location,
    content: fields.content,
  };
}

type CalendarDestination = "local" | "google" | "both";

// 새 일정 등록 시 어디에 등록할지 3지선다(2026-08-30) — "캘린더"(local)만 팀
// 전체가 보는 team_events_v2에 남고, "구글"(google)은 요청자 개인 구글
// 캘린더에만 등록해 팀 Calendar에는 아예 안 남는다(완전히 개인적인 일정을
// 팀 일정 목록에 채우고 싶지 않을 때). destination 필드가 없는 예전 요청은
// syncToGoogle 체크박스 방식(수정 다이얼로그가 아직 씀)과 호환되게 해석한다.
function destinationFromForm(formData: FormData): CalendarDestination {
  const raw = String(formData.get("destination") ?? "");
  if (raw === "google" || raw === "both") return raw;
  if (raw === "" && formData.get("syncToGoogle") === "on") return "both";
  return "local";
}

export async function createTeamEventV2(
  _prevState: TeamEventV2FormState,
  formData: FormData
): Promise<TeamEventV2FormState> {
  const { supabase, user } = await requireAuthedClient();

  const fields = fieldsFromForm(formData);
  if (!fields.title) return { error: "일정 제목을 입력하세요." };
  if (!fields.date_start) return { error: "일시를 입력하세요." };

  const destination = destinationFromForm(formData);

  // "구글" 단독 등록 — 팀 Calendar(team_events_v2)에는 아예 행을 만들지 않고
  // 요청자 개인 구글 캘린더에만 등록한다. 부가 기능이 아니라 이게 유일한
  // 저장 대상이라 실패하면 그대로 에러로 돌려준다(다른 곳에 남는 게 없으므로).
  if (destination === "google") {
    const accessToken = await getValidGoogleAccessToken(supabase, user.id);
    if (!accessToken) return { error: "구글 캘린더가 연결돼 있지 않습니다. 먼저 상단의 '구글 캘린더 연결'을 진행해 주세요." };
    try {
      await insertGoogleCalendarEvent(accessToken, googleEventInputFrom(fields));
    } catch (e) {
      return { error: `구글 캘린더 등록 실패: ${e instanceof Error ? e.message : String(e)}` };
    }
    revalidatePath(PATH);
    return undefined;
  }

  const { data: inserted, error } = await supabase.from("team_events_v2").insert(fields).select("id").single();
  if (error) return { error: `저장 실패: ${error.message}` };

  // 여기까지가 사용자가 기다리는 구간 — 아래 두 부수 효과(구글 캘린더 등록,
  // 팀 알림)는 실패해도 일정 저장 자체는 성공으로 처리하던 것들이라 응답
  // 이후로 미룬다(위 after() 주석 참고).
  after(async () => {
    const admin = createAdminClient();

    // 구글 캘린더 등록은 부가 기능이라 실패해도 팀 일정 저장 자체는 성공으로
    // 처리한다(연결 해제됐거나 토큰 만료 등) — 콘솔에만 남긴다.
    if (destination === "both") {
      try {
        const accessToken = await getValidGoogleAccessToken(admin, user.id);
        if (accessToken) {
          const googleEventId = await insertGoogleCalendarEvent(accessToken, googleEventInputFrom(fields));
          await admin
            .from("team_events_v2")
            .update({ google_event_id: googleEventId, google_event_owner_id: user.id })
            .eq("id", inserted.id);
        }
      } catch (e) {
        console.error("[createTeamEventV2] 구글 캘린더 등록 실패:", e instanceof Error ? e.message : e);
      }
    }

    const { data: profile } = await admin.from("profiles").select("name, email").eq("id", user.id).single();
    const actor = formatMember(profile?.name ?? null, null, profile?.email ?? user.email ?? "");
    // 알림을 누르면 목록만 뜨는 게 아니라 이 일정이 있는 달로 이동해 상세
    // 팝업까지 바로 열리게 month/day/eventId를 함께 실어 보낸다(2026-09-16,
    // 사용자 요청) — IndustryEventCalendar.tsx가 마운트 시 이 쿼리를 읽어
    // editing을 채운다.
    const day = kstDateStrFromIso(fields.date_start);
    await admin.from("notifications").insert({
      type: "event",
      title: fields.title,
      message: `${actor}님이 새 일정을 등록했습니다.`,
      link: `${PATH}?month=${day.slice(0, 7)}&day=${day}&eventId=${inserted.id}`,
    });
  });

  revalidatePath(PATH);
  return undefined;
}

export async function updateTeamEventV2(
  _prevState: TeamEventV2FormState,
  formData: FormData
): Promise<TeamEventV2FormState> {
  const { supabase, user } = await requireAuthedClient();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "잘못된 요청입니다." };

  const fields = fieldsFromForm(formData);
  if (!fields.title) return { error: "일정 제목을 입력하세요." };
  if (!fields.date_start) return { error: "일시를 입력하세요." };

  const wantsGoogleSync = destinationFromForm(formData) === "both";

  const { error } = await supabase
    .from("team_events_v2")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: `저장 실패: ${error.message}` };

  // 구글 캘린더 동기화는 원래도 실패를 콘솔에만 남기는 부가 기능이었고, 구글
  // API 왕복이 가장 느린 구간이라 통째로 응답 이후로 미룬다(위 after() 주석
  // 참고). 예전엔 이 일정이 구글과 무관해도(연결된 이벤트 없음 + 동기화
  // 안 함) 토큰 조회/갱신을 먼저 해버려서 그냥 버리는 왕복이 있었는데,
  // 이제 실제로 구글을 건드려야 할 때만 토큰을 가져온다.
  after(async () => {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("team_events_v2")
      .select("google_event_id, google_event_owner_id")
      .eq("id", id)
      .maybeSingle();

    // 이 일정을 구글 캘린더에 등록한 적이 없거나, 등록한 사람이 지금 수정하는
    // 본인일 때만 구글 쪽도 같이 건드린다 — 남이 등록해 둔 걸 내 토큰으로
    // 고칠 수는 없으므로(권한 없음), 그런 경우 구글 이벤트는 그대로 두고 우리
    // DB 필드도 손대지 않는다.
    const canTouchGoogle = !existing?.google_event_owner_id || existing.google_event_owner_id === user.id;
    if (!canTouchGoogle) return;
    if (!wantsGoogleSync && !existing?.google_event_id) return;

    let googleFieldUpdates: { google_event_id?: string | null; google_event_owner_id?: string | null } = {};
    try {
      const accessToken = await getValidGoogleAccessToken(admin, user.id);
      if (!accessToken) return;
      if (wantsGoogleSync) {
        const input = googleEventInputFrom(fields);
        if (existing?.google_event_id) {
          await updateGoogleCalendarEvent(accessToken, existing.google_event_id, input);
          googleFieldUpdates = { google_event_owner_id: user.id };
        } else {
          const googleEventId = await insertGoogleCalendarEvent(accessToken, input);
          googleFieldUpdates = { google_event_id: googleEventId, google_event_owner_id: user.id };
        }
      } else if (existing?.google_event_id) {
        await deleteGoogleCalendarEvent(accessToken, existing.google_event_id);
        googleFieldUpdates = { google_event_id: null, google_event_owner_id: null };
      }
    } catch (e) {
      console.error("[updateTeamEventV2] 구글 캘린더 동기화 실패:", e instanceof Error ? e.message : e);
      return;
    }

    if (Object.keys(googleFieldUpdates).length > 0) {
      await admin.from("team_events_v2").update(googleFieldUpdates).eq("id", id);
    }
  });

  revalidatePath(PATH);
  return undefined;
}

export async function deleteTeamEventV2(id: string): Promise<void> {
  const { supabase, user } = await requireAuthedClient();

  // 삭제된 행의 구글 연결 정보를 응답에 실어 받는다(delete().select()) — 예전엔
  // 구글 이벤트 id를 알아내려고 삭제 전에 select를 한 번 더 했는데, 행이 사라지기
  // 전에 알아야 하는 값이라는 것만 지키면 한 번의 왕복으로 충분하다.
  const { data: deleted } = await supabase
    .from("team_events_v2")
    .delete()
    .eq("id", id)
    .select("google_event_id, google_event_owner_id")
    .maybeSingle();

  // 등록한 사람(owner) 본인만 자기 구글 캘린더의 이벤트를 지울 수 있다.
  // 구글 왕복은 삭제 성공/실패와 무관한 부가 처리라 응답 이후로 미룬다.
  if (deleted?.google_event_id && deleted.google_event_owner_id === user.id) {
    const googleEventId = deleted.google_event_id;
    after(async () => {
      try {
        const accessToken = await getValidGoogleAccessToken(createAdminClient(), user.id);
        if (accessToken) await deleteGoogleCalendarEvent(accessToken, googleEventId);
      } catch (e) {
        console.error("[deleteTeamEventV2] 구글 캘린더 삭제 실패:", e instanceof Error ? e.message : e);
      }
    });
  }

  revalidatePath(PATH);
}
