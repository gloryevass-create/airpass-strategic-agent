"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TeamEventV2 } from "@/lib/queries/eventsV2";
import { createTeamEventV2, updateTeamEventV2, deleteTeamEventV2 } from "@/app/dashboard/actions/eventsV2";
import type { GoogleCalendarConnection } from "@/lib/queries/googleCalendar";
import type { GoogleCalendarEvent } from "@/lib/googleCalendar/api";
import { disconnectGoogleCalendar } from "@/app/dashboard/actions/googleCalendar";

// 태그별 점 색상 — 기존 Tailwind 버전(TeamEventCalendarV2.tsx)의 TAG_COLORS와
// 같은 태그 이름을 매핑하되, 이 목업은 색이 있는 알약이 아니라 작은 점 하나로
// 분류를 표시하는 방식이라 실제 hex 값으로 바꿨다(사용자 확인, 2026-08-29 —
// 태그 종류가 많아 디자인 원본의 고정 4분류로 줄이면 정보가 손실되므로 기존
// 태그 색 구분은 그대로 유지).
const TAG_DOT_COLORS: Record<string, string> = {
  회식: "#ec4899",
  미팅: "#eab308",
  행사: "#3b82f6",
  휴일: "#ef4444",
  체험: "#22c55e",
  교육: "#22c55e",
  제안: "#6b7280",
  박람회: "#a855f7",
  휴무: "#f97316",
  외근: "#f59e0b",
  마감: "#525252",
  쇼룸: "#eab308",
  세미나: "#6b7280",
  "공사&설치": "#16a34a",
};
const DEFAULT_DOT_COLOR = "var(--color-accent-600)";

function tagDotColor(tag: string | undefined): string {
  if (!tag) return DEFAULT_DOT_COLOR;
  return TAG_DOT_COLORS[tag] ?? DEFAULT_DOT_COLOR;
}

// 휴일 태그가 붙은 일정이 있는 날은 점 표시만으로는 눈에 잘 안 띄어서(2026-09-12,
// 사용자 요청) 날짜 칸 배경 전체를 옅은 빨강으로 칠한다 — 점 색(TAG_DOT_COLORS.휴일)과
// 같은 계열이라 통일감을 준다.
function isHolidayDay(items: DayItem[]): boolean {
  return items.some((item) => item.kind === "team" && item.event.tags?.includes("휴일"));
}

function toKstDateStr(iso: string) {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

function addDaysToDateStr(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function startOfWeek(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일(getUTCDay 그대로, 주 시작을 일요일로)
  return addDaysToDateStr(day, -wd);
}

function shiftMonthKeepDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  let month = m - 1 + delta;
  let year = y;
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  while (month > 11) {
    month -= 12;
    year += 1;
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

function buildMonthGrid(month: string): string[][] {
  const [y, m] = month.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const firstWeekday = firstOfMonth.getUTCDay(); // 0=일(주 시작을 일요일로)
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - firstWeekday));

  const weeks: string[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    weeks.push(week);
    if (w >= 4 && Number(week[6].slice(5, 7)) !== m) break;
  }
  return weeks;
}

function eventsOnDay(events: TeamEventV2[], day: string): TeamEventV2[] {
  return events.filter((e) => {
    const start = toKstDateStr(e.dateStart);
    const end = e.dateEnd ? toKstDateStr(e.dateEnd) : start;
    return day >= start && day <= end;
  });
}

function googleEventsOnDay(events: GoogleCalendarEvent[], day: string): GoogleCalendarEvent[] {
  return events.filter((e) => {
    const start = toKstDateStr(e.dateStart);
    const end = e.dateEnd ? toKstDateStr(e.dateEnd) : start;
    return day >= start && day <= end;
  });
}

// 팀 일정과 개인 구글 일정을 한 목록으로 섞어서(시작 시각순) 보여주기 위한
// 타입 — 구글 일정은 우리 DB에 없는 남의 데이터라 클릭해도 수정 다이얼로그를
// 열지 않고 새 탭에서 구글 캘린더 원본으로 보낸다(GoogleEventPill).
type DayItem = { kind: "team"; event: TeamEventV2 } | { kind: "google"; event: GoogleCalendarEvent };

function dayItems(day: string, events: TeamEventV2[], googleEvents: GoogleCalendarEvent[]): DayItem[] {
  const team: DayItem[] = eventsOnDay(events, day).map((event) => ({ kind: "team", event }));
  const google: DayItem[] = googleEventsOnDay(googleEvents, day).map((event) => ({ kind: "google", event }));
  return [...team, ...google].sort((a, b) => a.event.dateStart.localeCompare(b.event.dateStart));
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// SI Business 2/Cooperation/Marketing/Work Journal 상단의 "환경설정 바"(기본값
// 저장/초기화)와 같은 패턴을 캘린더에도 적용했다 — "기본 보기(월/주/일)"에 더해
// "구글캘린더 노출" 토글(showGoogleEventsDefault)도 같이 저장한다(사용자 확인,
// 2026-08-29 — Business/Cooperation의 showArchivedDefault 토글과 같은 자리).
const CALENDAR_DEFAULTS_STORAGE_KEY = "calendar:defaults";
const HARD_DEFAULT_VIEW: "month" | "week" | "day" = "month";
const HARD_DEFAULT_SHOW_GOOGLE_EVENTS = true;

function loadSavedCalendarDefaults(): { defaultView: "month" | "week" | "day"; showGoogleEvents: boolean } | null {
  try {
    const raw = window.localStorage.getItem(CALENDAR_DEFAULTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.defaultView !== "month" && parsed.defaultView !== "week" && parsed.defaultView !== "day") return null;
    if (typeof parsed.showGoogleEvents !== "boolean") return null;
    return { defaultView: parsed.defaultView, showGoogleEvents: parsed.showGoogleEvents };
  } catch {
    return null;
  }
}

function TopSettingsBar({
  view,
  onViewChange,
  showGoogleEvents,
  onShowGoogleEventsChange,
}: {
  view: "month" | "week" | "day";
  onViewChange: (v: "month" | "week" | "day") => void;
  showGoogleEvents: boolean;
  onShowGoogleEventsChange: (v: boolean) => void;
}) {
  const [savedNotice, setSavedNotice] = useState(false);

  function handleSave() {
    window.localStorage.setItem(CALENDAR_DEFAULTS_STORAGE_KEY, JSON.stringify({ defaultView: view, showGoogleEvents }));
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1500);
  }

  function handleReset() {
    window.localStorage.removeItem(CALENDAR_DEFAULTS_STORAGE_KEY);
    onViewChange(HARD_DEFAULT_VIEW);
    onShowGoogleEventsChange(HARD_DEFAULT_SHOW_GOOGLE_EVENTS);
  }

  return (
    <div
      className="calendar-top-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        width: "100%",
        padding: "6px var(--space-8)",
        background: "#ffffff",
        borderBottom: "1px solid var(--color-divider)",
        fontSize: 12,
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", color: "#374151" }}>
          <span>showGoogleEventsDefault</span>
          <span
            role="switch"
            aria-checked={showGoogleEvents}
            onClick={() => onShowGoogleEventsChange(!showGoogleEvents)}
            style={{
              position: "relative",
              width: 30,
              height: 16,
              borderRadius: 999,
              background: showGoogleEvents ? "#3b82f6" : "#d1d5db",
              transition: "background 0.15s",
              flex: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: showGoogleEvents ? 16 : 2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                transition: "left 0.15s",
              }}
            />
          </span>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#374151" }}>
          <span>defaultView</span>
          <select
            value={view}
            onChange={(e) => onViewChange(e.target.value as "month" | "week" | "day")}
            style={{
              minHeight: 24,
              padding: "2px 6px",
              fontSize: 11,
              width: "auto",
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: 5,
              color: "#1f2937",
            }}
          >
            <option value="month">month</option>
            <option value="week">week</option>
            <option value="day">day</option>
          </select>
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {savedNotice && <span style={{ color: "#3b82f6", fontSize: 11 }}>저장됨</span>}
        <button
          type="button"
          onClick={handleReset}
          style={{ background: "none", border: 0, padding: 0, color: "#6b7280", cursor: "pointer", font: "inherit", fontSize: 11 }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleSave}
          style={{
            fontSize: 11,
            fontWeight: 500,
            minHeight: 24,
            padding: "2px 10px",
            background: "#eef1fb",
            border: "1px solid #c7d0e8",
            borderRadius: 5,
            color: "#374151",
            cursor: "pointer",
          }}
        >
          Save as defaults
        </button>
      </div>
    </div>
  );
}

/** 담당자/참석자 다중 선택 — Tailwind 톤의 MemberMultiSelect 대신 Industry
 * 테마의 알약형 태그(.tag-chip)로 새로 그렸다(IndustryBusinessBoard.tsx의
 * ManagerChips와 동일한 이유 — 색이 섞이면 이 페이지만의 통일된 룩이 깨짐). */
function MemberChips({ name, label, members, defaultValue }: { name: string; label: string; members: string[]; defaultValue: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValue));

  function toggle(m: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {members.length === 0 && <span style={{ fontSize: 12 }}>등록된 팀원이 없습니다.</span>}
        {members.map((m) => (
          <label key={m} className={`tag-chip${selected.has(m) ? " active" : ""}`}>
            <input
              type="checkbox"
              name={name}
              value={m}
              checked={selected.has(m)}
              onChange={() => toggle(m)}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            />
            {m}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── 일정 추가/수정 다이얼로그 ─────────────────────────── */

function EventDialog({
  event,
  defaultDate,
  members,
  currentUserId,
  googleConnection,
  onClose,
}: {
  event: TeamEventV2 | null;
  defaultDate: string | null;
  members: string[];
  currentUserId: string;
  googleConnection: GoogleCalendarConnection | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const action = event ? updateTeamEventV2 : createTeamEventV2;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [, startTransition] = useTransition();
  const wasPendingRef = useRef(false);
  // 신규 등록 시에만 캘린더/구글/캘린더+구글 3지선다를 쓴다("구글" 단독은
  // team_events_v2 행 자체가 안 생기므로 이미 만들어진 일정을 수정하며 바꿀
  // 개념이 아님 — 수정은 기존 체크박스형 캘린더+구글 토글을 그대로 쓴다).
  const [destination, setDestination] = useState<"local" | "google" | "both">("local");
  const showGoogleOnlyFields = !event && destination === "google";

  // useActionState의 dispatch는 서버 액션 결과를 그 자리에서 돌려주지 않는다 —
  // pending이 true→false로 바뀌는 순간 에러가 없을 때만 닫는다(이 세션에서
  // 반복적으로 고친 패턴 재사용, 2026-08-29).
  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) {
      router.refresh();
      onClose();
    }
    wasPendingRef.current = pending;
  }, [pending, state, onClose, router]);

  function handleDelete() {
    if (!event) return;
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    startTransition(async () => {
      await deleteTeamEventV2(event.id);
      router.refresh();
      onClose();
    });
  }

  const defaultStart = event ? toDatetimeLocalValue(event.dateStart) : defaultDate ? `${defaultDate}T09:00` : "";

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: "min(560px,100%)", maxHeight: "88vh", overflowY: "auto", background: "#ffffff" }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="17" rx="0" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="7" y1="2" x2="7" y2="5" />
            <line x1="17" y1="2" x2="17" y2="5" />
          </svg>
          {event ? "일정 수정" : "새 일정 추가"}
        </div>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {event && <input type="hidden" name="id" value={event.id} />}
          <div className="field">
            <label>제목 *</label>
            <input className="input" name="title" defaultValue={event?.title ?? ""} required placeholder="일정 제목" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div className="field">
              <label>시작일시 *</label>
              <input className="input" name="dateStart" type="datetime-local" defaultValue={defaultStart} required />
            </div>
            <div className="field">
              <label>종료일시</label>
              <input className="input" name="dateEnd" type="datetime-local" defaultValue={toDatetimeLocalValue(event?.dateEnd ?? null)} />
            </div>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" name="isDatetime" defaultChecked={event?.isDatetime ?? true} style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }} />
            시간까지 정확함(끄면 날짜만 있는 일정으로 표시)
          </label>
          {(() => {
            if (event) {
              // 수정: 기존 일정은 이미 team_events_v2 행이 있으므로 "구글 단독"으로
              // 바꾸는 개념이 없다 — 캘린더+구글 동기화 여부만 토글한다.
              const syncedByOther = Boolean(event.googleEventOwnerId && event.googleEventOwnerId !== currentUserId);
              if (syncedByOther) {
                return (
                  <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                    다른 사용자가 자신의 구글 캘린더에 연결해 둔 일정입니다(이 항목은 그 사람만 동기화를 바꿀 수 있어요).
                  </p>
                );
              }
              if (!googleConnection) return null;
              return (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    name="syncToGoogle"
                    defaultChecked={Boolean(event.googleEventId && event.googleEventOwnerId === currentUserId)}
                    style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
                  />
                  내 구글 캘린더({googleConnection.googleEmail})에도 등록
                </label>
              );
            }
            // 신규 추가: 구글 캘린더가 연결돼 있을 때만 3지선다를 보여준다
            // (연결 안 돼 있으면 "캘린더"만 가능하므로 굳이 선택지를 안 보여줌).
            if (!googleConnection) return null;
            return (
              <div className="field">
                <label>등록 위치</label>
                <div className="seg">
                  {([
                    ["local", "캘린더"],
                    ["google", "구글"],
                    ["both", "캘린더+구글"],
                  ] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={`seg-opt${destination === v ? " active" : ""}`}
                      onClick={() => setDestination(v)}
                      style={{ border: 0 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="destination" value={destination} />
                {destination === "google" && (
                  <p className="text-muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                    내 구글 캘린더({googleConnection.googleEmail})에만 등록되고, 팀 Calendar 목록에는 남지 않습니다.
                  </p>
                )}
              </div>
            );
          })()}
          {!showGoogleOnlyFields && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              <div className="field">
                <label>태그(쉼표로 구분)</label>
                <input className="input" name="tags" defaultValue={event?.tags.join(", ") ?? ""} placeholder="예: 미팅, 외근" />
              </div>
              <div className="field">
                <label>분류</label>
                <input className="input" name="category" defaultValue={event?.category ?? ""} />
              </div>
              <div className="field">
                <label>장소</label>
                <input className="input" name="location" defaultValue={event?.location ?? ""} />
              </div>
              <div className="field">
                <label>대상</label>
                <input className="input" name="target" defaultValue={event?.target ?? ""} />
              </div>
            </div>
          )}
          {showGoogleOnlyFields && (
            <div className="field">
              <label>장소</label>
              <input className="input" name="location" defaultValue="" />
            </div>
          )}
          {!showGoogleOnlyFields && (
            <>
              <MemberChips name="assignees" label="담당자" members={members} defaultValue={event?.assignees ?? []} />
              <MemberChips name="attendees" label="참석자" members={members} defaultValue={event?.attendees ?? []} />
            </>
          )}
          <div className="field">
            <label>내용</label>
            <textarea className="input" name="content" defaultValue={event?.content ?? ""} rows={3} />
          </div>
          {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
          <div className="dialog-actions">
            {event && (
              <button type="button" onClick={handleDelete} className="btn btn-secondary btn-danger" style={{ marginRight: "auto" }}>
                삭제
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── 이벤트 알약(점 + 제목) ─────────────────────────── */

function EventPill({ event, onClick, big }: { event: TeamEventV2; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={big ? undefined : "day-item-pill"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        font: "inherit",
        fontSize: big ? 14 : 11.5,
        padding: big ? "6px 0" : "1px 0",
        color: "var(--color-text)",
        overflow: "hidden",
      }}
    >
      <span className="day-item-dot" style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: tagDotColor(event.tags[0]) }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.title}</span>
    </button>
  );
}

const GOOGLE_DOT_COLOR = "#4285F4";

/** 구글 캘린더 일정은 우리 DB 데이터가 아니라 수정·삭제를 할 수 없다 —
 * 클릭하면 구글 캘린더 원본을 새 탭으로 연다. */
function GoogleEventPill({ event, big }: { event: GoogleCalendarEvent; big?: boolean }) {
  return (
    <a
      href={event.htmlLink || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={big ? undefined : "day-item-pill"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        textAlign: "left",
        textDecoration: "none",
        fontSize: big ? 14 : 11.5,
        padding: big ? "6px 0" : "1px 0",
        color: "var(--color-text)",
        overflow: "hidden",
      }}
    >
      <span className="day-item-dot" style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: GOOGLE_DOT_COLOR }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{event.title}</span>
    </a>
  );
}

function DayItemPill({ item, onEditTeam, big }: { item: DayItem; onEditTeam: (e: TeamEventV2) => void; big?: boolean }) {
  return item.kind === "team" ? (
    <EventPill event={item.event} onClick={() => onEditTeam(item.event)} big={big} />
  ) : (
    <GoogleEventPill event={item.event} big={big} />
  );
}

/* ─────────────────────────── 구글 캘린더 연결 상태 ─────────────────────────── */

function GoogleCalendarControl({ connection }: { connection: GoogleCalendarConnection | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleDisconnect() {
    if (!window.confirm("구글 캘린더 연결을 해제할까요? 내 구글 일정이 더 이상 표시되지 않습니다.")) return;
    startTransition(async () => {
      await disconnectGoogleCalendar();
      router.refresh();
    });
  }

  if (!connection) {
    return (
      <a href="/auth/google-calendar/connect" className="btn btn-secondary" style={{ fontSize: 12 }}>
        <span style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", background: GOOGLE_DOT_COLOR }} />
        구글 캘린더 연결
      </a>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span className="text-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ flex: "none", width: 8, height: 8, borderRadius: "50%", background: GOOGLE_DOT_COLOR }} />
        {connection.googleEmail} 연결됨
      </span>
      <button type="button" className="btn btn-ghost" onClick={handleDisconnect} style={{ fontSize: 12 }}>
        연결 해제
      </button>
    </div>
  );
}

/* ─────────────────────────── 메인 캘린더 ─────────────────────────── */

export function IndustryEventCalendar({
  events,
  month,
  initialCursor,
  initialEventId,
  members,
  currentUserId,
  googleConnection,
  googleEvents,
  googleConnected,
  googleError,
}: {
  events: TeamEventV2[];
  month: string;
  initialCursor: string;
  initialEventId: string | null;
  members: string[];
  currentUserId: string;
  googleConnection: GoogleCalendarConnection | null;
  googleEvents: GoogleCalendarEvent[];
  googleConnected: boolean;
  googleError: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "week" | "day">(HARD_DEFAULT_VIEW);
  const [showGoogleEvents, setShowGoogleEvents] = useState(HARD_DEFAULT_SHOW_GOOGLE_EVENTS);
  const [cursor, setCursor] = useState(initialCursor);
  const [editing, setEditing] = useState<TeamEventV2 | "new" | null>(null);
  // 알림벨/푸시 알림에서 "?eventId=..."로 들어오면 그 일정 상세 팝업을 바로
  // 연다(2026-09-16, 사용자 요청 — app/dashboard/actions/eventsV2.ts가 알림
  // 링크에 month/day/eventId를 함께 실어 보낸다, page.tsx가 month/day로 그
  // 달의 events를 미리 불러온 상태로 넘어온다). 연 뒤에는 eventId만 지우고
  // month/day는 유지한다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!initialEventId) return;
    const found = events.find((e) => e.id === initialEventId);
    if (found) setEditing(found);
    router.replace(`/dashboard/calendar?month=${month}&day=${initialCursor}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [newEventDate, setNewEventDate] = useState<string | null>(null);
  // new Date().toISOString()는 항상 UTC 기준이라, 한국 자정~오전 9시 사이에는
  // 하루 전 날짜가 나와 "오늘" 표시가 하루 밀리는 버그가 있었다(2026-09-16,
  // 사용자 확인 — 이 앱은 항상 KST 기준이므로 브라우저 로컬 시간대와 무관하게
  // KST로 계산해야 한다). 위 toKstDateStr과 같은 방식(+9시간 후 UTC로 다시
  // 뽑기)으로 오늘 날짜를 구한다.
  const todayStr = toKstDateStr(new Date().toISOString());

  // 구글 연동 후 돌아왔을 때만 잠깐 보여줄 안내문 — URL의 googleConnected/
  // googleError 쿼리는 한 번 보여준 뒤 지운다(계속 남아있으면 새로고침·다른
  // 달로 이동해도 배너가 안 사라짐).
  const [googleBanner] = useState(() =>
    googleConnected
      ? { type: "success" as const, message: "구글 캘린더가 연결됐습니다." }
      : googleError
        ? {
            type: "error" as const,
            message:
              googleError === "not_configured"
                ? "구글 캘린더 연동이 아직 설정되지 않았습니다."
                : googleError === "no_refresh_token"
                  ? "구글에서 재연결 권한을 받지 못했습니다. 구글 계정의 '연결된 앱' 설정에서 이 앱 연결을 해제한 뒤 다시 시도해주세요."
                  : "구글 캘린더 연결에 실패했습니다. 다시 시도해주세요.",
          }
        : null
  );
  useEffect(() => {
    if (!googleConnected && !googleError) return;
    const params = new URLSearchParams({ month });
    if (cursor) params.set("day", cursor);
    router.replace(`/dashboard/calendar?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장된 기본 보기는 브라우저에서만 읽을 수 있어(localStorage) 마운트 후에
  // 반영한다 — 서버가 렌더링한 HTML(항상 "month")과 클라이언트 초기값이
  // 달라지는 하이드레이션 경고를 피하기 위함(IndustryBusinessBoard.tsx와
  // 동일한 패턴).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadSavedCalendarDefaults();
    if (saved) {
      setView(saved.defaultView);
      setShowGoogleEvents(saved.showGoogleEvents);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 토글이 꺼져 있으면 구글 일정을 아예 안 섞는다 — dayItems() 호출부를 매번
  // 고치는 대신 여기서 한 번만 걸러 둔다.
  const visibleGoogleEvents = showGoogleEvents ? googleEvents : [];

  // 커서가 현재 서버에서 불러온 달(month)을 벗어나면(주/일 보기에서 달 경계를
  // 넘어가는 경우 포함) 그 달의 데이터를 새로 불러와야 한다 — URL의 month·day를
  // 갱신해 서버 컴포넌트가 다시 조회하게 한다(기존 EventMonthNav와 같은 방식).
  // cursor는 항상 즉시 갱신한다 — router.push만 하고 넘어가면, 이 컴포넌트
  // 인스턴스가 리마운트되지 않는 한 useState(initialCursor)가 새 prop으로
  // 다시 초기화되지 않아 periodLabel(cursor 기반)이 예전 달에 멈춰 있는 채
  // 그리드(month prop 기반이라 바로 갱신됨)만 새 달로 바뀌는 불일치가
  // 있었다(사용자 확인, 2026-09-12).
  function navigateTo(newCursor: string) {
    const newMonth = newCursor.slice(0, 7);
    setCursor(newCursor);
    if (newMonth === month) return;
    router.push(`/dashboard/calendar?month=${newMonth}&day=${newCursor}`);
  }

  function prevPeriod() {
    navigateTo(view === "month" ? shiftMonthKeepDay(cursor, -1) : view === "week" ? addDaysToDateStr(cursor, -7) : addDaysToDateStr(cursor, -1));
  }
  function nextPeriod() {
    navigateTo(view === "month" ? shiftMonthKeepDay(cursor, 1) : view === "week" ? addDaysToDateStr(cursor, 7) : addDaysToDateStr(cursor, 1));
  }
  function goToday() {
    navigateTo(todayStr);
  }

  function openAdd(day?: string) {
    setNewEventDate(day ?? cursor);
    setEditing("new");
  }
  function closeDialog() {
    setEditing(null);
    setNewEventDate(null);
  }

  const [cy, cm, cd] = cursor.split("-").map(Number);
  const cursorDate = new Date(Date.UTC(cy, cm - 1, cd));

  let periodLabel = "";
  if (view === "month") {
    periodLabel = `${cy}년 ${cm}월`;
  } else if (view === "week") {
    const start = startOfWeek(cursor);
    const end = addDaysToDateStr(start, 6);
    const [, sm, sd] = start.split("-").map(Number);
    const [, em, ed] = end.split("-").map(Number);
    periodLabel = `${sm}월 ${sd}일 - ${em}월 ${ed}일`;
  } else {
    periodLabel = `${cy}년 ${cm}월 ${cd}일 (${WEEKDAYS[cursorDate.getUTCDay()]})`;
  }

  const weeks = view === "month" ? buildMonthGrid(month) : [];
  const weekDays = view === "week" ? Array.from({ length: 7 }, (_, i) => addDaysToDateStr(startOfWeek(cursor), i)) : [];
  const dayEventItems = view === "day" ? dayItems(cursor, events, visibleGoogleEvents) : [];

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <TopSettingsBar view={view} onViewChange={setView} showGoogleEvents={showGoogleEvents} onShowGoogleEventsChange={setShowGoogleEvents} />
      <div className="calendar-page-content" style={{ padding: "var(--space-8)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="0" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="7" y1="2" x2="7" y2="5" />
              <line x1="17" y1="2" x2="17" y2="5" />
            </svg>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>Calendar</h1>
          </div>
          <p className="text-muted calendar-subtitle" style={{ margin: "var(--space-2) 0 0", fontSize: 12 }}>
            개인 구글계정을 등록하고 연동하면 캘린더에서 개인 일정도 확인이 가능합니다.(본인 일정에만 노출)
          </p>
        </div>
        <GoogleCalendarControl connection={googleConnection} />
      </div>

      {googleBanner && (
        <p
          style={{
            fontSize: 13,
            margin: "var(--space-3) 0 0",
            color: googleBanner.type === "error" ? "var(--color-accent-900)" : "var(--color-accent-700)",
          }}
        >
          {googleBanner.message}
        </p>
      )}

      <div className="calendar-toolbar-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "var(--space-6)", marginBottom: "var(--space-4)", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary btn-icon" onClick={prevPeriod} aria-label="이전">
            &lt;
          </button>
          <h2 style={{ minWidth: 100, textAlign: "center", margin: 0, fontSize: 18, fontFamily: "var(--font-heading)" }}>{periodLabel}</h2>
          <button type="button" className="btn btn-secondary btn-icon" onClick={nextPeriod} aria-label="다음">
            &gt;
          </button>
          <button type="button" className="btn btn-secondary" onClick={goToday} style={{ marginLeft: "var(--space-2)" }}>
            오늘
          </button>
          <div className="seg" style={{ marginLeft: "var(--space-3)" }}>
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`seg-opt${view === v ? " active" : ""}`}
                onClick={() => setView(v)}
                style={{ border: 0 }}
              >
                {v === "month" ? "월" : v === "week" ? "주" : "일"}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openAdd()}>
          + 새 일정 추가
        </button>
      </div>

      {view === "month" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 1 }}>
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                style={{
                  padding: "var(--space-2)",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: i === 0 ? "#ef4444" : "color-mix(in srgb, var(--color-text) 60%, transparent)",
                  textAlign: "center",
                }}
              >
                {wd}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 1 }}>
              {week.map((day) => {
                const inMonth = day.slice(0, 7) === month;
                const dayEvts = dayItems(day, events, visibleGoogleEvents);
                const isToday = day === todayStr;
                const isHoliday = isHolidayDay(dayEvts);
                const MAX = 3;
                return (
                  <div
                    key={day}
                    className="day-card"
                    style={{
                      height: 112,
                      padding: "var(--space-2)",
                      background: isHoliday ? "color-mix(in srgb, #ef4444 10%, #ffffff)" : "#ffffff",
                      border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      overflow: "hidden",
                      opacity: inMonth ? 1 : 0.35,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: 14,
                          lineHeight: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: isToday ? 22 : undefined,
                          height: isToday ? 22 : undefined,
                          borderRadius: isToday ? "50%" : undefined,
                          background: isToday ? "var(--color-accent)" : undefined,
                          color: isToday ? "var(--color-bg)" : undefined,
                          fontWeight: isToday ? 600 : 400,
                        }}
                      >
                        {Number(day.slice(8, 10))}
                      </span>
                      <button
                        type="button"
                        onClick={() => openAdd(day)}
                        className="btn btn-ghost btn-icon"
                        style={{ width: 18, height: 18, fontSize: 13, opacity: 0.3, minHeight: "auto" }}
                        title="이 날짜에 일정 추가"
                      >
                        +
                      </button>
                    </div>
                    {dayEvts.slice(0, MAX).map((item) => (
                      <DayItemPill key={`${item.kind}-${item.event.id}`} item={item} onEditTeam={setEditing} />
                    ))}
                    {dayEvts.length > MAX && (
                      <button
                        type="button"
                        onClick={() => {
                          setView("day");
                          navigateTo(day);
                        }}
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          textAlign: "left",
                          cursor: "pointer",
                          font: "inherit",
                          fontSize: 11,
                          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                        }}
                      >
                        +{dayEvts.length - MAX}개 더보기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === "week" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
          {weekDays.map((day, i) => {
            const dayEvts = dayItems(day, events, visibleGoogleEvents);
            const isToday = day === todayStr;
            const isHoliday = isHolidayDay(dayEvts);
            return (
              <div
                key={day}
                className="day-card"
                style={{
                  minHeight: 420,
                  padding: "var(--space-2)",
                  background: isHoliday ? "color-mix(in srgb, #ef4444 10%, #ffffff)" : "#ffffff",
                  border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingBottom: "var(--space-2)",
                    borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      fontFamily: "var(--font-heading)",
                      fontWeight: 700,
                      color: i === 0 ? "#ef4444" : "color-mix(in srgb, var(--color-text) 60%, transparent)",
                    }}
                  >
                    {WEEKDAYS[i]}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: 14,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: isToday ? 22 : undefined,
                      height: isToday ? 22 : undefined,
                      borderRadius: isToday ? "50%" : undefined,
                      background: isToday ? "var(--color-accent)" : undefined,
                      color: isToday ? "var(--color-bg)" : undefined,
                      fontWeight: isToday ? 600 : 400,
                    }}
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                </div>
                {dayEvts.map((item) => (
                  <DayItemPill key={`${item.kind}-${item.event.id}`} item={item} onEditTeam={setEditing} />
                ))}
                <button
                  type="button"
                  onClick={() => openAdd(day)}
                  className="btn btn-ghost"
                  style={{ marginTop: "var(--space-2)", fontSize: 12, opacity: 0.5, alignSelf: "flex-start" }}
                >
                  + 추가
                </button>
              </div>
            );
          })}
        </div>
      )}

      {view === "day" && (
        <div
          className="day-card"
          style={{
            maxWidth: 640,
            padding: "var(--space-4)",
            background: isHolidayDay(dayEventItems) ? "color-mix(in srgb, #ef4444 10%, #ffffff)" : "#ffffff",
            border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {dayEventItems.map((item) => (
            <DayItemPill key={`${item.kind}-${item.event.id}`} item={item} onEditTeam={setEditing} big />
          ))}
          {dayEventItems.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, margin: "var(--space-2) 0" }}>
              일정이 없습니다.
            </p>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => openAdd(cursor)} style={{ marginTop: "var(--space-3)", alignSelf: "flex-start" }}>
            + 이 날짜에 일정 추가
          </button>
        </div>
      )}

      {editing && (
        <EventDialog
          event={editing === "new" ? null : editing}
          defaultDate={newEventDate}
          members={members}
          currentUserId={currentUserId}
          googleConnection={googleConnection}
          onClose={closeDialog}
        />
      )}
      </div>
    </div>
  );
}
