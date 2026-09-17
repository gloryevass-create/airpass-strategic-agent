import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { getTeamEventsV2InRange } from "@/lib/queries/eventsV2";
import { addDaysToDateStr, kstDateStrFromIso, kstDayEndExclusiveIso, kstDayStartIso, kstTimeLabel } from "@/lib/kstDate";

type Client = SupabaseClient<Database>;

/** Today Issue(2026-09-17) — 어제/오늘/내일 브리핑 데이터.
 *
 * ## 왜 새로 짰나
 * 기존 보드 쿼리 함수(`getBusinessProjectsV2` 등)를 재사용하지 않는다 — 그쪽은
 * 댓글·히스토리·첨부·URL까지 통째로 읽고 기간 필터가 아예 없어서 이 용도에는
 * 과하다. 여기서는 필요한 컬럼만 좁게 읽는다.
 *
 * ## 3일치를 한 번에 받는 이유
 * 탭(어제/오늘/내일)을 누를 때마다 서버를 왕복하지 않도록 **어제 00:00 KST ~
 * 모레 00:00 KST**를 한 번에 조회하고 JS에서 KST 날짜별로 쪼갠다. 하루치만
 * 받는 것과 쿼리 수가 같고(범위만 넓음), 탭 전환은 클라이언트 상태라 즉시 반응한다.
 *
 * ## 날짜 컬럼 타입이 섞여 있다 (버그 1순위 지점)
 * `created_at`/`updated_at`과 일부 기한 컬럼은 `timestamptz`, 나머지 기한
 * 컬럼은 `date`다. timestamptz를 `"2026-09-17"` 같은 문자열과 비교하면 UTC
 * 자정으로 해석돼 조용히 9시간 밀린다 — 자세한 구분은 `lib/kstDate.ts` 주석 참고.
 * 이 파일은 timestamptz는 항상 `kstDayStartIso`~`kstDayEndExclusiveIso` 구간으로,
 * `date`는 날짜 문자열로 비교한다.
 *
 * ## 신규/수정 판정
 * `updated_at`은 DB 트리거가 아니라 서버 액션이 직접 채우고, insert 시점엔
 * `created_at`과 같다. 그래서 한 행을 **`created_at`의 날짜에 "신규"로,
 * `updated_at`의 날짜에 "수정"으로** 각각 넣는다(두 날짜가 다르고 둘 다 3일
 * 창 안에 있을 때). 이렇게 해야 "어제 등록되고 오늘 수정된" 항목이 어제
 * 칸에서 사라지지 않는다.
 */

export type IssueGroup = "calendar" | "business" | "cooperation" | "marketing" | "sales" | "records" | "aihub" | "todo";

export const ISSUE_GROUP_LABEL: Record<IssueGroup, string> = {
  calendar: "캘린더",
  business: "SI Business",
  cooperation: "Cooperation",
  marketing: "Marketing",
  sales: "영업지원",
  records: "기록·문서",
  aihub: "AI HUB",
  todo: "내 할 일",
};

/** 그룹 표시 순서 — 일정이 먼저, 개인 할 일이 마지막. */
export const ISSUE_GROUP_ORDER: IssueGroup[] = [
  "calendar",
  "business",
  "cooperation",
  "marketing",
  "sales",
  "records",
  "aihub",
  "todo",
];

export type IssueItem = {
  /** React key — 같은 행이 신규/수정으로 두 번 들어갈 수 있어 kind까지 포함한다. */
  key: string;
  group: IssueGroup;
  /** "신규" | "수정" | "일정" | "기한" | "발송" | "히스토리" | "댓글" | "스크랩" 등 */
  kind: string;
  title: string;
  /** 상태·기관명·수신자처럼 제목 옆에 붙는 부가 정보(없으면 null). */
  detail: string | null;
  /** 일정·기한에만 붙는 "HH:MM"(종일 항목은 null). */
  timeLabel: string | null;
  /** 정렬용 시각(ISO). */
  at: string;
  link: string | null;
};

export type DayIssues = {
  dateStr: string;
  /** 그날 열리는 일정 */
  scheduled: IssueItem[];
  /** 그날 등록·수정된 항목 */
  activity: IssueItem[];
  /** 그날이 마감·제출일인 항목 */
  deadlines: IssueItem[];
};

export type TodayIssueData = {
  baseDateStr: string;
  yesterday: DayIssues;
  today: DayIssues;
  tomorrow: DayIssues;
  /** AI 요약(크론이 하루 3회 갱신). 아직 생성 전이거나 테이블이 없으면 null. */
  briefing: { summary: string; generatedAt: string } | null;
};

/** 목록에 한 줄로 보여줄 만큼만 자른다. */
function snippet(text: string | null, max = 60): string {
  const one = (text ?? "").replace(/\s+/g, " ").trim();
  if (!one) return "(내용 없음)";
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/** 여러 값을 " · "로 잇되 빈 값은 버린다. */
function joinDetail(...parts: (string | null | undefined)[]): string | null {
  const kept = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  return kept.length > 0 ? kept.join(" · ") : null;
}

/** 조회 상한 — 전체를 읽는 테이블에 거는 안전장치.
 * 지금은 가장 큰 보드가 60행이라(실측, 2026-09-17) 전체를 읽어도 부담이 없고,
 * 한 행을 신규·수정·기한 세 용도로 같이 써야 해서 기간 필터를 걸지 않는다.
 * 나중에 수천 행으로 늘면 이 상한에 걸리므로, 그때 기간 필터로 바꾼다. */
const FULL_SCAN_LIMIT = 500;

export type GetTodayIssuesOptions = {
  /** 개인 소유 데이터(To-Do)를 포함할지. 기본 true.
   *
   * **크론(AI 요약)은 반드시 false로 부른다** — 크론은 service_role 클라이언트를
   * 쓰는데 그건 RLS를 우회하므로, true로 두면 `todos`에서 **팀원 전원의 할 일**이
   * 딸려 나와 팀 전체가 보는 요약 문장에 남의 개인 할 일이 새어 나간다. false면
   * 쿼리 자체를 보내지 않는다(읽지도 않는 게 가장 안전하다). */
  includePersonalTodos?: boolean;
};

export async function getTodayIssues(
  supabase: Client,
  /** 기준일(한국시간 `YYYY-MM-DD`). 호출부가 넘긴다 — 자정 전후 동작을 테스트로 고정하기 위해. */
  baseDateStr: string,
  options?: GetTodayIssuesOptions
): Promise<TodayIssueData> {
  const includePersonalTodos = options?.includePersonalTodos ?? true;
  const yesterdayStr = addDaysToDateStr(baseDateStr, -1);
  const tomorrowStr = addDaysToDateStr(baseDateStr, 1);
  const dayStrs = [yesterdayStr, baseDateStr, tomorrowStr];

  const winStart = kstDayStartIso(yesterdayStr);
  const winEnd = kstDayEndExclusiveIso(tomorrowStr);

  const inWindow = (iso: string | null): boolean => iso != null && iso >= winStart && iso < winEnd;

  const [
    events,
    businessRes,
    cooperationRes,
    marketingRes,
    quotationsRes,
    meetingNotesRes,
    vendorsRes,
    productsRes,
    journalRes,
    aiReviewsRes,
    aiToolsRes,
    businessHistoryRes,
    cooperationHistoryRes,
    marketingHistoryRes,
    businessCommentsRes,
    cooperationCommentsRes,
    marketingCommentsRes,
    memosRes,
    memoCommentsRes,
    meetingNoteCommentsRes,
    aiReviewCommentsRes,
    materialEmailRes,
    scrapsRes,
    aiIssuesRes,
    todosRes,
    prespecRes,
    briefingRes,
  ] = await Promise.all([
    getTeamEventsV2InRange(supabase, winStart, winEnd),

    // 전체를 읽는 것들 — 신규·수정 판정과 기한 판정에 같은 행을 함께 쓴다.
    supabase
      .from("business_projects_v2")
      .select(
        "id, title, status, stage, org_name, created_at, updated_at, submission_date, presentation_date, construction_start, construction_end"
      )
      .limit(FULL_SCAN_LIMIT),
    supabase
      .from("cooperation_projects")
      .select("id, title, status, company, created_at, updated_at, project_start_date, project_end_date")
      .limit(FULL_SCAN_LIMIT),
    supabase
      .from("marketing_tasks")
      .select("id, title, status, category, created_at, updated_at, due_date, due_date_end")
      .limit(FULL_SCAN_LIMIT),
    supabase
      .from("quotations")
      .select("id, quote_number, customer_name, status, created_at, updated_at, valid_until")
      .limit(FULL_SCAN_LIMIT),
    supabase
      .from("meeting_notes")
      .select("id, title, meeting_date, location, created_at, updated_at")
      .limit(FULL_SCAN_LIMIT),

    // 기한 컬럼이 없어 기간 필터만으로 충분한 것들(updated_at >= created_at이라
    // updated_at 구간 하나로 신규·수정 양쪽이 다 걸린다).
    supabase
      .from("partner_vendors")
      .select("id, company_name, created_at, updated_at")
      .gte("updated_at", winStart)
      .lt("updated_at", winEnd),
    supabase
      .from("product_catalog")
      .select("id, name, created_at, updated_at")
      .gte("updated_at", winStart)
      .lt("updated_at", winEnd),
    supabase
      .from("work_journal_entries")
      .select("id, author_name, content, created_at, updated_at")
      .gte("updated_at", winStart)
      .lt("updated_at", winEnd),
    supabase
      .from("ai_reviews")
      .select("id, title, created_at, updated_at")
      .gte("updated_at", winStart)
      .lt("updated_at", winEnd),
    supabase
      .from("ai_tools")
      .select("id, title, url, created_at, updated_at")
      .gte("updated_at", winStart)
      .lt("updated_at", winEnd),

    // 히스토리·댓글은 "추가된 사실"이 이벤트라 created_at만 본다.
    supabase
      .from("business_projects_v2_history")
      .select("id, project_id, content, author_email, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("cooperation_projects_history")
      .select("id, project_id, content, author_email, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("marketing_tasks_history")
      .select("id, task_id, content, author_email, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("business_projects_v2_comments")
      .select("id, project_id, content, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("cooperation_projects_comments")
      .select("id, project_id, content, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("marketing_tasks_comments")
      .select("id, task_id, content, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),

    // ad_strategy_memos에는 updated_at 컬럼이 아예 없다 — 메모 수정은 감지할 수 없고
    // 새로 쓴 것만 잡힌다(알려진 한계).
    supabase
      .from("ad_strategy_memos")
      .select("id, title, category, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("ad_strategy_memo_comments")
      .select("id, memo_id, content, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("meeting_note_comments")
      .select("id, note_id, content, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("ai_review_comments")
      .select("id, review_id, content, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),

    supabase
      .from("material_email_logs")
      .select("id, subject, recipient_emails, sender_email, quotation_quote_number, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),
    supabase
      .from("notice_scraps")
      .select("id, notice_type, notice_id, created_at")
      .gte("created_at", winStart)
      .lt("created_at", winEnd),

    // issue_date는 date 컬럼이라 날짜 문자열로 그대로 비교한다.
    supabase.from("ai_issues").select("id, title, summary, link, issue_date").in("issue_date", dayStrs),

    // 개인 소유 데이터 — 세션 클라이언트로 부르면 RLS가 본인 행만 돌려준다
    // (팀원끼리 서로 안 보임). service_role로 부르는 크론은 위 옵션 주석대로
    // 아예 조회하지 않는다. due_date는 date 컬럼이라 날짜 문자열 비교.
    includePersonalTodos
      ? supabase
          .from("todos")
          .select("id, title, due_date, priority, is_completed")
          .in("due_date", dayStrs)
          .eq("is_completed", false)
      : Promise.resolve({ data: [] as { id: string; title: string; due_date: string | null; priority: string; is_completed: boolean }[] }),

    // opinion_close_at은 timestamptz — 반드시 구간으로 비교한다.
    supabase
      .from("prespec_notices")
      .select("id, title, notice_inst, opinion_close_at")
      .gte("opinion_close_at", winStart)
      .lt("opinion_close_at", winEnd),

    // 아직 마이그레이션(0077) 적용 전이면 에러가 오는데, 요약은 없어도 화면이
    // 동작해야 하므로 조용히 null로 넘긴다.
    supabase.from("daily_briefings").select("summary, generated_at").eq("issue_date", baseDateStr).maybeSingle(),
  ]);

  const buckets: Record<string, DayIssues> = {
    [yesterdayStr]: { dateStr: yesterdayStr, scheduled: [], activity: [], deadlines: [] },
    [baseDateStr]: { dateStr: baseDateStr, scheduled: [], activity: [], deadlines: [] },
    [tomorrowStr]: { dateStr: tomorrowStr, scheduled: [], activity: [], deadlines: [] },
  };

  const add = (dayStr: string, bucket: keyof Omit<DayIssues, "dateStr">, item: IssueItem) => {
    buckets[dayStr]?.[bucket].push(item);
  };

  /** timestamptz 기한 한 건을 그 날짜 칸에 넣는다. */
  const addDeadlineAt = (
    iso: string | null,
    group: IssueGroup,
    label: string,
    title: string,
    detail: string | null,
    link: string | null,
    key: string
  ) => {
    if (!inWindow(iso)) return;
    const dayStr = kstDateStrFromIso(iso as string);
    add(dayStr, "deadlines", {
      key,
      group,
      kind: label,
      title,
      detail,
      timeLabel: kstTimeLabel(iso as string),
      at: iso as string,
      link,
    });
  };

  /** date 컬럼(YYYY-MM-DD) 기한 한 건을 넣는다 — 시각이 없으므로 timeLabel은 null. */
  const addDeadlineOn = (
    dateStr: string | null,
    group: IssueGroup,
    label: string,
    title: string,
    detail: string | null,
    link: string | null,
    key: string
  ) => {
    if (!dateStr || !buckets[dateStr]) return;
    add(dateStr, "deadlines", {
      key,
      group,
      kind: label,
      title,
      detail,
      timeLabel: null,
      at: kstDayStartIso(dateStr),
      link,
    });
  };

  /** 한 행을 created_at 날짜엔 "신규", updated_at 날짜엔 "수정"으로 넣는다. */
  const addCreatedAndUpdated = (
    row: { id: string; created_at: string; updated_at?: string | null },
    group: IssueGroup,
    title: string,
    detail: string | null,
    link: string | null,
    table: string
  ) => {
    const createdDay = kstDateStrFromIso(row.created_at);
    if (inWindow(row.created_at)) {
      add(createdDay, "activity", {
        key: `${table}:${row.id}:new`,
        group,
        kind: "신규",
        title,
        detail,
        timeLabel: kstTimeLabel(row.created_at),
        at: row.created_at,
        link,
      });
    }
    const updatedAt = row.updated_at ?? null;
    if (!updatedAt || !inWindow(updatedAt)) return;
    const updatedDay = kstDateStrFromIso(updatedAt);
    if (updatedDay === createdDay) return; // 등록 직후 = 같은 이벤트라 중복으로 넣지 않는다
    add(updatedDay, "activity", {
      key: `${table}:${row.id}:edit`,
      group,
      kind: "수정",
      title,
      detail,
      timeLabel: kstTimeLabel(updatedAt),
      at: updatedAt,
      link,
    });
  };

  // ── 팀 캘린더 일정 ────────────────────────────────────────────────────────
  // 여러 날에 걸친 일정은 걸친 날마다 넣는다(3일 창 안에서만).
  for (const e of events) {
    const startDay = kstDateStrFromIso(e.dateStart);
    const endDay = e.dateEnd ? kstDateStrFromIso(e.dateEnd) : startDay;
    for (const dayStr of dayStrs) {
      if (dayStr < startDay || dayStr > endDay) continue;
      const multiDay = startDay !== endDay;
      add(dayStr, "scheduled", {
        key: `event:${e.id}:${dayStr}`,
        group: "calendar",
        kind: multiDay ? "기간 일정" : "일정",
        title: e.title,
        detail: joinDetail(e.category, e.location, e.assignees.join(", ")),
        timeLabel: e.isDatetime && dayStr === startDay ? kstTimeLabel(e.dateStart) : null,
        at: e.dateStart,
        link: `/dashboard/calendar?month=${dayStr.slice(0, 7)}&day=${dayStr}&eventId=${e.id}`,
      });
    }
  }

  // ── SI Business ──────────────────────────────────────────────────────────
  for (const p of businessRes.data ?? []) {
    const link = `/dashboard/business?open=${p.id}`;
    const detail = joinDetail(p.org_name, p.status, p.stage);
    addCreatedAndUpdated(p, "business", p.title, detail, link, "business");
    addDeadlineAt(p.submission_date, "business", "제출", p.title, detail, link, `business:${p.id}:submission`);
    addDeadlineAt(p.presentation_date, "business", "발표", p.title, detail, link, `business:${p.id}:presentation`);
    addDeadlineOn(p.construction_start, "business", "시공 시작", p.title, detail, link, `business:${p.id}:cstart`);
    addDeadlineOn(p.construction_end, "business", "시공 종료", p.title, detail, link, `business:${p.id}:cend`);
  }

  // ── Cooperation ──────────────────────────────────────────────────────────
  for (const c of cooperationRes.data ?? []) {
    const link = `/dashboard/cooperation?open=${c.id}`;
    const detail = joinDetail(c.company, c.status);
    addCreatedAndUpdated(c, "cooperation", c.title, detail, link, "cooperation");
    addDeadlineAt(c.project_start_date, "cooperation", "시작", c.title, detail, link, `coop:${c.id}:start`);
    addDeadlineAt(c.project_end_date, "cooperation", "종료", c.title, detail, link, `coop:${c.id}:end`);
  }

  // ── Marketing ────────────────────────────────────────────────────────────
  for (const m of marketingRes.data ?? []) {
    const link = `/dashboard/marketing-tasks?open=${m.id}`;
    const detail = joinDetail(m.category, m.status);
    addCreatedAndUpdated(m, "marketing", m.title, detail, link, "marketing");
    addDeadlineAt(m.due_date, "marketing", "마감", m.title, detail, link, `mkt:${m.id}:due`);
    addDeadlineAt(m.due_date_end, "marketing", "마감(종료)", m.title, detail, link, `mkt:${m.id}:dueend`);
  }

  // ── 영업지원: 산출내역 · 자료메일 · 제조사 · 제품 ──────────────────────────
  for (const q of quotationsRes.data ?? []) {
    const link = `/dashboard/quotations?open=${q.id}`;
    const title = `${q.quote_number} (${q.customer_name})`;
    const detail = q.status === "final" ? "확정" : "작성 중";
    addCreatedAndUpdated(q, "sales", title, detail, link, "quotation");
    addDeadlineOn(q.valid_until, "sales", "유효기한", title, detail, link, `quotation:${q.id}:valid`);
  }

  for (const log of materialEmailRes.data ?? []) {
    if (!inWindow(log.created_at)) continue;
    add(kstDateStrFromIso(log.created_at), "activity", {
      key: `material_email:${log.id}`,
      group: "sales",
      kind: "메일 발송",
      title: log.subject,
      detail: joinDetail(
        `→ ${log.recipient_emails.join(", ")}`,
        log.quotation_quote_number ? `산출내역 ${log.quotation_quote_number}` : null,
        log.sender_email
      ),
      timeLabel: kstTimeLabel(log.created_at),
      at: log.created_at,
      link: `/dashboard/material-email?open=${log.id}`,
    });
  }

  for (const v of vendorsRes.data ?? []) {
    addCreatedAndUpdated(v, "sales", v.company_name, "제조사", "/dashboard/vendors", "vendor");
  }
  for (const p of productsRes.data ?? []) {
    addCreatedAndUpdated(p, "sales", p.name, "제품 카탈로그", "/dashboard/product-catalog", "product");
  }

  // ── 기록·문서: 업무일지 · 메모 · 미팅노트 ─────────────────────────────────
  for (const j of journalRes.data ?? []) {
    addCreatedAndUpdated(
      j,
      "records",
      snippet(j.content, 40),
      `업무일지 · ${j.author_name}`,
      `/dashboard/work-journal?open=${j.id}`,
      "journal"
    );
  }

  const MEMO_CATEGORY_LABEL: Record<string, string> = {
    business: "Business",
    cooperation: "Cooperation",
    marketing: "Marketing",
    etc: "기타",
  };
  for (const m of memosRes.data ?? []) {
    if (!inWindow(m.created_at)) continue;
    add(kstDateStrFromIso(m.created_at), "activity", {
      key: `memo:${m.id}`,
      group: "records",
      kind: "신규",
      title: m.title,
      detail: joinDetail("메모보드", MEMO_CATEGORY_LABEL[m.category] ?? m.category),
      timeLabel: kstTimeLabel(m.created_at),
      at: m.created_at,
      link: `/dashboard/memos/${m.id}`,
    });
  }

  for (const n of meetingNotesRes.data ?? []) {
    const link = `/dashboard/meeting-notes/${n.id}`;
    addCreatedAndUpdated(n, "records", n.title, "미팅노트", link, "meeting_note");
    // meeting_date는 date 컬럼 — 그날 열리는(열렸던) 미팅이라 "일정"으로 넣는다.
    if (n.meeting_date && buckets[n.meeting_date]) {
      add(n.meeting_date, "scheduled", {
        key: `meeting_note:${n.id}:date`,
        group: "records",
        kind: "미팅",
        title: n.title,
        detail: joinDetail("미팅노트", n.location),
        timeLabel: null,
        at: kstDayStartIso(n.meeting_date),
        link,
      });
    }
  }

  // ── AI HUB ───────────────────────────────────────────────────────────────
  for (const r of aiReviewsRes.data ?? []) {
    addCreatedAndUpdated(r, "aihub", r.title, "AI Review", `/dashboard/ai-review/${r.id}`, "ai_review");
  }
  for (const t of aiToolsRes.data ?? []) {
    addCreatedAndUpdated(t, "aihub", t.title, "AI 도구", `/dashboard/ai-tools?open=${t.id}`, "ai_tool");
  }
  for (const issue of aiIssuesRes.data ?? []) {
    if (!buckets[issue.issue_date]) continue;
    add(issue.issue_date, "activity", {
      key: `ai_issue:${issue.id}`,
      group: "aihub",
      kind: "AI 이슈",
      title: issue.title,
      detail: issue.summary,
      timeLabel: null,
      at: kstDayStartIso(issue.issue_date),
      link: "/dashboard/ai-issue",
    });
  }

  // ── 내 할 일(개인, RLS로 본인 것만) ───────────────────────────────────────
  const TODO_PRIORITY_LABEL: Record<string, string> = { high: "높음", medium: "보통", low: "낮음" };
  for (const t of todosRes.data ?? []) {
    addDeadlineOn(
      t.due_date,
      "todo",
      "기한",
      t.title,
      `우선순위 ${TODO_PRIORITY_LABEL[t.priority] ?? t.priority}`,
      "/dashboard/todos",
      `todo:${t.id}`
    );
  }

  // ── 조달 사전규격 의견마감 ────────────────────────────────────────────────
  for (const p of prespecRes.data ?? []) {
    addDeadlineAt(
      p.opinion_close_at,
      "sales",
      "의견마감",
      p.title,
      joinDetail("사전규격", p.notice_inst),
      "/dashboard/prespec",
      `prespec:${p.id}`
    );
  }

  // ── 히스토리·댓글·스크랩(부모 제목이 필요한 것들) ──────────────────────────
  const titleById = new Map<string, string>();
  for (const p of businessRes.data ?? []) titleById.set(`business:${p.id}`, p.title);
  for (const c of cooperationRes.data ?? []) titleById.set(`cooperation:${c.id}`, c.title);
  for (const m of marketingRes.data ?? []) titleById.set(`marketing:${m.id}`, m.title);
  for (const n of meetingNotesRes.data ?? []) titleById.set(`meeting_note:${n.id}`, n.title);

  // 위 4개는 이미 전체를 읽었지만, 메모/AI Review는 기간 필터로 읽어서 오래된
  // 항목에 달린 댓글의 제목이 없다 — 필요한 id만 따로 조회한다(없으면 건너뜀).
  const memoIdsNeeded = Array.from(new Set((memoCommentsRes.data ?? []).map((c) => c.memo_id)));
  const reviewIdsNeeded = Array.from(new Set((aiReviewCommentsRes.data ?? []).map((c) => c.review_id)));
  const scraps = scrapsRes.data ?? [];
  const scrapIdsByType = {
    budget: scraps.filter((s) => s.notice_type === "budget").map((s) => s.notice_id),
    prespec: scraps.filter((s) => s.notice_type === "prespec").map((s) => s.notice_id),
    news: scraps.filter((s) => s.notice_type === "news").map((s) => s.notice_id),
  };

  const [memoTitlesRes, reviewTitlesRes, budgetTitlesRes, prespecTitlesRes, newsTitlesRes] = await Promise.all([
    memoIdsNeeded.length > 0
      ? supabase.from("ad_strategy_memos").select("id, title").in("id", memoIdsNeeded)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    reviewIdsNeeded.length > 0
      ? supabase.from("ai_reviews").select("id, title").in("id", reviewIdsNeeded)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    scrapIdsByType.budget.length > 0
      ? supabase.from("budget_bids").select("id, title").in("id", scrapIdsByType.budget)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    scrapIdsByType.prespec.length > 0
      ? supabase.from("prespec_notices").select("id, title").in("id", scrapIdsByType.prespec)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    scrapIdsByType.news.length > 0
      ? supabase.from("news_articles").select("id, title").in("id", scrapIdsByType.news)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  for (const m of memoTitlesRes.data ?? []) titleById.set(`memo:${m.id}`, m.title);
  for (const r of reviewTitlesRes.data ?? []) titleById.set(`ai_review:${r.id}`, r.title);
  const scrapTitleById = new Map<string, string>();
  for (const row of [...(budgetTitlesRes.data ?? []), ...(prespecTitlesRes.data ?? []), ...(newsTitlesRes.data ?? [])]) {
    scrapTitleById.set(row.id, row.title);
  }

  /** 히스토리/댓글처럼 "부모 항목에 뭔가 추가된" 이벤트를 넣는다. */
  const addChildEvent = <R extends { id: string; content: string; created_at: string }>(
    rows: R[],
    parentIdOf: (row: R) => string,
    group: IssueGroup,
    kind: string,
    titlePrefix: string,
    linkOf: (parentId: string) => string,
    table: string
  ) => {
    for (const row of rows) {
      if (!inWindow(row.created_at)) continue;
      const parentId = parentIdOf(row);
      const parentTitle = titleById.get(`${titlePrefix}:${parentId}`);
      add(kstDateStrFromIso(row.created_at), "activity", {
        key: `${table}:${row.id}`,
        group,
        kind,
        title: parentTitle ?? snippet(row.content, 40),
        detail: parentTitle ? snippet(row.content, 60) : null,
        timeLabel: kstTimeLabel(row.created_at),
        at: row.created_at,
        link: linkOf(parentId),
      });
    }
  };

  addChildEvent(
    businessHistoryRes.data ?? [],
    (r) => r.project_id,
    "business",
    "히스토리",
    "business",
    (id) => `/dashboard/business?open=${id}`,
    "business_history"
  );
  addChildEvent(
    cooperationHistoryRes.data ?? [],
    (r) => r.project_id,
    "cooperation",
    "히스토리",
    "cooperation",
    (id) => `/dashboard/cooperation?open=${id}`,
    "cooperation_history"
  );
  addChildEvent(
    marketingHistoryRes.data ?? [],
    (r) => r.task_id,
    "marketing",
    "히스토리",
    "marketing",
    (id) => `/dashboard/marketing-tasks?open=${id}`,
    "marketing_history"
  );
  addChildEvent(
    businessCommentsRes.data ?? [],
    (r) => r.project_id,
    "business",
    "댓글",
    "business",
    (id) => `/dashboard/business?open=${id}`,
    "business_comment"
  );
  addChildEvent(
    cooperationCommentsRes.data ?? [],
    (r) => r.project_id,
    "cooperation",
    "댓글",
    "cooperation",
    (id) => `/dashboard/cooperation?open=${id}`,
    "cooperation_comment"
  );
  addChildEvent(
    marketingCommentsRes.data ?? [],
    (r) => r.task_id,
    "marketing",
    "댓글",
    "marketing",
    (id) => `/dashboard/marketing-tasks?open=${id}`,
    "marketing_comment"
  );
  addChildEvent(
    memoCommentsRes.data ?? [],
    (r) => r.memo_id,
    "records",
    "댓글",
    "memo",
    (id) => `/dashboard/memos/${id}`,
    "memo_comment"
  );
  addChildEvent(
    meetingNoteCommentsRes.data ?? [],
    (r) => r.note_id,
    "records",
    "의견",
    "meeting_note",
    (id) => `/dashboard/meeting-notes/${id}`,
    "meeting_note_comment"
  );
  addChildEvent(
    aiReviewCommentsRes.data ?? [],
    (r) => r.review_id,
    "aihub",
    "의견",
    "ai_review",
    (id) => `/dashboard/ai-review/${id}`,
    "ai_review_comment"
  );

  const SCRAP_LABEL: Record<string, string> = { budget: "입찰공고", prespec: "사전규격", news: "뉴스" };
  const SCRAP_LINK: Record<string, string> = {
    budget: "/dashboard/budget",
    prespec: "/dashboard/prespec",
    news: "/dashboard/news",
  };
  for (const s of scraps) {
    if (!inWindow(s.created_at)) continue;
    add(kstDateStrFromIso(s.created_at), "activity", {
      key: `scrap:${s.id}`,
      group: "sales",
      kind: "스크랩",
      title: scrapTitleById.get(s.notice_id) ?? `${SCRAP_LABEL[s.notice_type]} 항목`,
      detail: SCRAP_LABEL[s.notice_type],
      timeLabel: kstTimeLabel(s.created_at),
      at: s.created_at,
      link: SCRAP_LINK[s.notice_type],
    });
  }

  // 일정·기한은 시각 빠른 순, 변동은 최근 순으로 보여준다.
  for (const day of Object.values(buckets)) {
    day.scheduled.sort((a, b) => a.at.localeCompare(b.at));
    day.deadlines.sort((a, b) => a.at.localeCompare(b.at));
    day.activity.sort((a, b) => b.at.localeCompare(a.at));
  }

  return {
    baseDateStr,
    yesterday: buckets[yesterdayStr],
    today: buckets[baseDateStr],
    tomorrow: buckets[tomorrowStr],
    briefing: briefingRes.data
      ? { summary: briefingRes.data.summary, generatedAt: briefingRes.data.generated_at }
      : null,
  };
}
