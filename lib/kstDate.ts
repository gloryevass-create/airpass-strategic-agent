/** 한국시간(KST) 날짜 계산 공용 헬퍼.
 *
 * 이 앱의 모든 "날짜"는 KST 기준인데 서버(Vercel)는 UTC로 돌기 때문에, `new Date()`의
 * 로컬 게터나 `toISOString().slice(0,10)`을 그대로 쓰면 **한국시간 자정~오전 9시
 * 사이에 하루가 밀린다**. 실제로 Calendar "오늘" 표시와 진입 월이 그 시간대에 전날로
 * 나오는 버그가 있었고(2026-09-16 사용자 확인), AI Issue 크론도 수집분이 "어제"
 * 날짜로 찍히는 같은 버그를 겪었다(2026-09-07).
 *
 * 같은 계산이 calendar-feed 라우트·eventsV2 액션·calendar 페이지·ai-issues 크론에
 * 각자 조금씩 다른 모양으로 복사돼 있었는데, Today Issue(어제/오늘/내일 브리핑)가
 * KST 하루 경계에 전적으로 의존하면서 5번째 사본을 만들 이유가 없어져 여기로 모았다
 * (2026-09-17).
 *
 * ## `date` 컬럼과 `timestamptz` 컬럼을 구분해서 쓸 것
 * 이 앱의 날짜 컬럼은 두 종류가 섞여 있다(마이그레이션 확인) —
 * - `date`: `todos.due_date`, `quotations.valid_until`, `meeting_notes.meeting_date`,
 *   `work_journal_entries.entry_date`, `business_projects_v2.construction_start/end`
 *   → `todayKstDateStr()` 같은 **날짜 문자열로 그대로 비교**한다.
 * - `timestamptz`: 모든 `created_at`/`updated_at`,
 *   `business_projects_v2.submission_date`/`presentation_date`,
 *   `marketing_tasks.due_date`/`due_date_end`,
 *   `cooperation_projects.project_start_date`/`project_end_date`,
 *   `prespec_notices.opinion_close_at`
 *   → `kstDayStartIso()`/`kstDayEndExclusiveIso()`로 만든 **구간으로 비교**한다.
 *
 * timestamptz 컬럼을 `"2026-09-17"` 같은 날짜 문자열과 비교하면 UTC 자정으로
 * 해석돼 조용히 9시간 밀린다 — 낮 시간대 데이터로는 드러나지 않아 더 위험하다.
 */

/** 오늘(한국시간) 날짜 문자열 `YYYY-MM-DD`.
 * `en-CA` 로케일이 ISO와 같은 `YYYY-MM-DD`를 주므로 타임존 변환을 브라우저/Node의
 * Intl에 맡긴다 — 직접 9시간을 더하는 방식보다 의도가 분명하다. */
export function todayKstDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 임의의 시각(UTC ISO)이 한국시간으로 며칠인지 `YYYY-MM-DD`로 돌려준다. */
export function kstDateStrFromIso(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 그 날짜의 한국시간 00:00을 UTC ISO로. 구간 조회의 시작(포함)에 쓴다. */
export function kstDayStartIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString();
}

/** 그 날짜의 한국시간 23:59:59를 UTC ISO로 — 경계를 포함하는(`lte`) 조회용.
 * 새로 쓰는 코드는 되도록 `kstDayEndExclusiveIso()` + `lt`를 쓰는 게 안전하다
 * (23:59:59.5 같은 값이 빠지지 않음). */
export function kstDayEndIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59+09:00`).toISOString();
}

/** 다음날 한국시간 00:00을 UTC ISO로 — 경계를 제외하는(`lt`) 조회용. */
export function kstDayEndExclusiveIso(dateStr: string): string {
  return kstDayStartIso(addDaysToDateStr(dateStr, 1));
}

/** 날짜 문자열에 일수를 더한다(음수면 과거). KST 자정을 기준으로 계산하므로
 * 서머타임 없는 한국시간에서는 단순 덧셈과 같지만, 문자열 파싱 실수를 막아준다. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 한국시간 기준 "HH:MM". 일정 목록에 시각을 붙일 때 쓴다. */
export function kstTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
