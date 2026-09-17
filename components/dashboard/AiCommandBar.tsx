"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeamEventV2 } from "@/app/dashboard/actions/eventsV2";
import { createMemo } from "@/app/dashboard/memos/actions";
import { createBusinessProjectV2 } from "@/app/dashboard/actions/businessProjectsV2";
import { createCooperationProject } from "@/app/dashboard/actions/cooperationProjects";
import { createMarketingTask } from "@/app/dashboard/actions/marketingTasks";
import { sendMaterialEmailFromAiDraft } from "@/app/dashboard/actions/materialEmail";
import { createWorkJournalEntry } from "@/app/dashboard/actions/workJournal";
import {
  runAiCommand,
  type AiCommandActionResult,
  type AiCommandResult,
  type AiCommandTurn,
} from "@/app/dashboard/actions/aiCommand";
import { MemberMultiSelect } from "@/components/dashboard/MemberMultiSelect";
import { AI_MATERIAL_EMAIL_DRAFT_KEY } from "@/lib/aiMaterialEmailDraft";

const MEMO_CATEGORY_OPTIONS = [
  { value: "business", label: "SI Business" },
  { value: "cooperation", label: "Cooperation" },
  { value: "marketing", label: "Marketing" },
  { value: "etc", label: "etc" },
];

const BUSINESS_STAGES = ["Ⅰ영업진행", "Ⅱ사업제안", "Ⅲ제안서작성", "Ⅳ사업수행", "Ⅴ사업완료"];
const BUSINESS_STATUSES = ["시작 전", "진행 중", "완료", "보류", "실패"];
const COOPERATION_RELATION_TYPES = ["콘텐츠/하드웨어", "공동생산 판매", "제품 판매", "자재구매", "일반", "비즈니스협업"];
const COOPERATION_STATUSES = ["시작 전", "진행 중", "완료", "종료"];
// IndustryMarketingBoard.tsx의 CATEGORIES와 같은 목록을 유지해야 한다(2026-09-17).
const MARKETING_CATEGORIES = ["문서", "웹페이지", "광고", "행사"];
const MARKETING_STAGES = ["기획", "제작", "수행"];
const MARKETING_STATUSES = ["시작 전", "진행 중", "완료", "종료"];

const FIELD_CLASS =
  "rounded-sm border border-hairline bg-background px-3 py-1.5 text-sm text-ink outline-none focus:border-primary";

// IndustryWorkJournalBoard.tsx의 weekLabelFromDate와 동일한 규칙 — 날짜에서
// "YY년 MM월" 주차 라벨을 자동으로 만든다(사용자가 직접 입력한 것처럼 채워짐).
function weekLabelFromDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  if (!y || !m) return "";
  return `${y.slice(2)}년 ${m}월`;
}

/** 정상 흐름에서는 AI 결과를 그대로 기존 create 액션에 바로 제출해 자동 등록한다
 * (확인 버튼 클릭 요구 안 함, 사용자 확인 2026-08-26). 이 폼들은 자동 등록이
 * 실패했을 때(필수값 누락 등)만 나타나는 복구용 수정 화면이다. */
function CalendarEventFallbackForm({
  input,
  members,
  onDone,
}: {
  input: Extract<AiCommandResult, { tool: "create_calendar_event" }>["input"];
  members: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTeamEventV2, undefined);

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        router.refresh();
        onDone();
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          제목 *
          <input name="title" defaultValue={input.title} required className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          시작일시 *
          <input name="dateStart" type="datetime-local" defaultValue={input.dateStart} required className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          종료일시
          <input name="dateEnd" type="datetime-local" defaultValue={input.dateEnd} className={FIELD_CLASS} />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-mute sm:col-span-2">
          <input type="checkbox" name="isDatetime" defaultChecked={!input.isAllDay} />
          시간까지 정확함(끄면 날짜만 있는 일정으로 표시)
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          등록 위치
          <select name="destination" defaultValue={input.destination} className={FIELD_CLASS}>
            <option value="local">캘린더</option>
            <option value="google">구글</option>
            <option value="both">캘린더+구글</option>
          </select>
        </label>
        <input type="hidden" name="tags" value="" />
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          분류
          <input name="category" defaultValue={input.category} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          장소
          <input name="location" defaultValue={input.location} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          대상
          <input name="target" defaultValue={input.target} className={FIELD_CLASS} />
        </label>
        <MemberMultiSelect name="assignees" label="담당자" members={members} defaultValue={input.assignees} />
        <MemberMultiSelect name="attendees" label="참석자" members={members} defaultValue={input.attendees} />
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-mute">
        내용
        <textarea name="content" defaultValue={input.content} rows={2} className={FIELD_CLASS} />
      </label>
      {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "저장 중..." : "일정 등록"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-fit rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function MemoFallbackForm({
  input,
  onDone,
}: {
  input: Extract<AiCommandResult, { tool: "create_memo" }>["input"];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(createMemo, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr]">
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          구분
          <select name="category" defaultValue={input.category} className={FIELD_CLASS}>
            {MEMO_CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          제목 *
          <input name="title" defaultValue={input.title} required className={FIELD_CLASS} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-mute">
        내용 *
        <textarea name="content" defaultValue={input.content} required rows={3} className={FIELD_CLASS} />
      </label>
      {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "저장 중..." : "메모 등록"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-fit rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function BusinessProjectFallbackForm({
  input,
  members,
  onDone,
}: {
  input: Extract<AiCommandResult, { tool: "create_business_project" }>["input"];
  members: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createBusinessProjectV2, undefined);

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        router.refresh();
        onDone();
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          사업명 *
          <input name="title" defaultValue={input.title} required className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          단계
          <select name="stage" defaultValue={input.stage} className={FIELD_CLASS}>
            <option value="">미분류</option>
            {BUSINESS_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          진행 상태
          <select name="status" defaultValue={input.status} className={FIELD_CLASS}>
            {BUSINESS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          발주기관
          <input name="orgName" defaultValue={input.orgName} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          참여 형태
          <input name="participationType" defaultValue={input.participationType} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          사업 유형
          <input name="workType" defaultValue={input.workType} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          금액(원)
          <input name="amount" type="number" defaultValue={input.amount} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          제출일
          <input name="submissionDate" type="date" defaultValue={input.submissionDate} className={FIELD_CLASS} />
        </label>
        <div className="sm:col-span-2">
          <MemberMultiSelect name="assignees" label="담당자" members={members} defaultValue={input.assignees} />
        </div>
      </div>
      {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "저장 중..." : "사업 등록"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-fit rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function CooperationProjectFallbackForm({
  input,
  members,
  onDone,
}: {
  input: Extract<AiCommandResult, { tool: "create_cooperation_project" }>["input"];
  members: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createCooperationProject, undefined);

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        router.refresh();
        onDone();
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          이름 *
          <input name="title" defaultValue={input.title} required className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          업체
          <input name="company" defaultValue={input.company} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          관계
          <select name="relationType" defaultValue={input.relationType} className={FIELD_CLASS}>
            <option value="">미분류</option>
            {COOPERATION_RELATION_TYPES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          진행 상태
          <select name="status" defaultValue={input.status} className={FIELD_CLASS}>
            {COOPERATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          프로젝트 시작일
          <input name="projectStartDate" type="date" defaultValue={input.projectStartDate} className={FIELD_CLASS} />
        </label>
        <MemberMultiSelect name="mainAssignees" label="메인담당" members={members} defaultValue={input.mainAssignees} />
        <MemberMultiSelect name="subAssignees" label="서브담당" members={members} defaultValue={input.subAssignees} />
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-mute">
        내용
        <textarea name="content" defaultValue={input.content} rows={2} className={FIELD_CLASS} />
      </label>
      {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "저장 중..." : "협업 등록"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-fit rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function MarketingTaskFallbackForm({
  input,
  members,
  onDone,
}: {
  input: Extract<AiCommandResult, { tool: "create_marketing_task" }>["input"];
  members: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createMarketingTask, undefined);

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        router.refresh();
        onDone();
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          업무명 *
          <input name="title" defaultValue={input.title} required className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          분류
          <select name="category" defaultValue={input.category} className={FIELD_CLASS}>
            <option value="">미분류</option>
            {MARKETING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          단계
          <select name="stage" defaultValue={input.stage} className={FIELD_CLASS}>
            <option value="">미분류</option>
            {MARKETING_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          진행 상태
          <select name="status" defaultValue={input.status} className={FIELD_CLASS}>
            {MARKETING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          마감일
          <input name="dueDate" type="date" defaultValue={input.dueDate} className={FIELD_CLASS} />
        </label>
        <div className="sm:col-span-2">
          <MemberMultiSelect name="assignees" label="담당자" members={members} defaultValue={input.assignees} />
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-mute">
        내용
        <textarea name="content" defaultValue={input.content} rows={2} className={FIELD_CLASS} />
      </label>
      {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "저장 중..." : "업무 등록"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-fit rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function WorkJournalFallbackForm({
  input,
  currentUserName,
  onDone,
}: {
  input: Extract<AiCommandResult, { tool: "create_work_journal_entry" }>["input"];
  currentUserName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createWorkJournalEntry, undefined);

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        router.refresh();
        onDone();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="authorName" value={currentUserName} />
      <input type="hidden" name="weekLabel" value={weekLabelFromDate(input.entryDate)} />
      <label className="flex flex-col gap-1 text-xs text-ink-mute">
        날짜
        <input name="entryDate" type="date" defaultValue={input.entryDate} className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-mute">
        내용 *
        <textarea name="content" defaultValue={input.content} required rows={3} className={FIELD_CLASS} />
      </label>
      {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "저장 중..." : "일지 등록"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-fit rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function buildCalendarFormData(input: Extract<AiCommandResult, { tool: "create_calendar_event" }>["input"]): FormData {
  const fd = new FormData();
  fd.set("title", input.title);
  fd.set("dateStart", input.dateStart);
  fd.set("dateEnd", input.dateEnd);
  if (!input.isAllDay) fd.set("isDatetime", "on");
  fd.set("destination", input.destination);
  fd.set("tags", "");
  fd.set("category", input.category);
  fd.set("location", input.location);
  fd.set("target", input.target);
  fd.set("content", input.content);
  for (const a of input.assignees) fd.append("assignees", a);
  for (const a of input.attendees) fd.append("attendees", a);
  return fd;
}

function buildMemoFormData(input: Extract<AiCommandResult, { tool: "create_memo" }>["input"]): FormData {
  const fd = new FormData();
  fd.set("category", input.category);
  fd.set("title", input.title);
  fd.set("content", input.content);
  return fd;
}

function buildBusinessFormData(input: Extract<AiCommandResult, { tool: "create_business_project" }>["input"]): FormData {
  const fd = new FormData();
  fd.set("title", input.title);
  fd.set("stage", input.stage);
  fd.set("status", input.status);
  fd.set("orgName", input.orgName);
  fd.set("participationType", input.participationType);
  fd.set("workType", input.workType);
  fd.set("result", input.result);
  fd.set("amount", input.amount);
  fd.set("progressRate", input.progressRate);
  fd.set("submissionDate", input.submissionDate);
  fd.set("submissionMethod", input.submissionMethod);
  fd.set("presentationDate", input.presentationDate);
  fd.set("constructionStart", input.constructionStart);
  fd.set("constructionEnd", input.constructionEnd);
  fd.set("constructionContent", input.constructionContent);
  fd.set("notes", input.notes);
  for (const a of input.assignees) fd.append("assignees", a);
  return fd;
}

function buildCooperationFormData(input: Extract<AiCommandResult, { tool: "create_cooperation_project" }>["input"]): FormData {
  const fd = new FormData();
  fd.set("title", input.title);
  fd.set("company", input.company);
  fd.set("relationType", input.relationType);
  fd.set("workType", input.workType);
  fd.set("status", input.status);
  fd.set("projectStartDate", input.projectStartDate);
  fd.set("projectEndDate", input.projectEndDate);
  fd.set("content", input.content);
  for (const a of input.mainAssignees) fd.append("mainAssignees", a);
  for (const a of input.subAssignees) fd.append("subAssignees", a);
  return fd;
}

const MAX_CLARIFICATION_ROUNDS = 3;
const AI_CALL_TIMEOUT_MS = 28000;

/** 서버 쪽이 아무 응답 없이 멈추거나(플랫폼 강제 종료, 네트워크 문제 등) 연결이
 * 끊겨도 클라이언트가 "처리 중" 상태로 영영 멈추지 않도록 일정 시간 후 반드시
 * 실패로 확정한다 — 실제로 겪었던 무한 대기 버그의 재발 방지(사용자 확인,
 * 2026-08-27). */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

function buildMarketingFormData(input: Extract<AiCommandResult, { tool: "create_marketing_task" }>["input"]): FormData {
  const fd = new FormData();
  fd.set("title", input.title);
  fd.set("content", input.content);
  fd.set("category", input.category);
  fd.set("workType", input.workType);
  fd.set("stage", input.stage);
  fd.set("status", input.status);
  fd.set("dueDate", input.dueDate);
  fd.set("dueDateEnd", input.dueDateEnd);
  for (const a of input.assignees) fd.append("assignees", a);
  return fd;
}

// 작성자는 항상 로그인한 사용자 본인으로 자동 지정한다(수동 폼과 동일한 규칙,
// IndustryWorkJournalBoard.tsx 참고) — AI가 이름을 추출·추측하지 않는다.
function buildWorkJournalFormData(
  input: Extract<AiCommandResult, { tool: "create_work_journal_entry" }>["input"],
  currentUserName: string
): FormData {
  const fd = new FormData();
  fd.set("authorName", currentUserName);
  fd.set("entryDate", input.entryDate);
  fd.set("weekLabel", weekLabelFromDate(input.entryDate));
  fd.set("content", input.content);
  return fd;
}

export function AiCommandBar({ members, currentUserName }: { members: string[]; currentUserName: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<AiCommandTurn[]>([]);
  const [clarificationRounds, setClarificationRounds] = useState(0);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fallbackDraft, setFallbackDraft] = useState<AiCommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMessage("");
    setHistory([]);
    setClarificationRounds(0);
    setPendingQuestion(null);
    setStatusMessage(null);
    setFallbackDraft(null);
    setError(null);
  }

  function submit() {
    const text = message.trim();
    if (!text || isPending) return;
    setError(null);
    setStatusMessage(null);
    startTransition(async () => {
      // 서버가 응답 없이 멈추거나 연결이 끊겨도 여기서 반드시 실패로 확정되므로
      // isPending(처리 중)이 영영 풀리지 않는 상태에 빠지지 않는다.
      let res: AiCommandActionResult;
      try {
        res = await withTimeout(
          runAiCommand(text, history),
          AI_CALL_TIMEOUT_MS,
          "AI 응답이 너무 오래 걸려 요청을 중단했습니다. 다시 시도해 주세요."
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "AI 처리 중 오류가 발생했습니다.");
        return;
      }
      if ("error" in res) {
        setError(res.error);
        return;
      }
      if (res.tool === "ask_clarification") {
        // 같은 요청을 여러 번 되물어도 계속 모호하면("무한 루프"처럼 느껴지는 원인) 이쯤에서
        // 멈추고 메뉴를 직접 언급해 다시 시도하도록 안내한다(사용자 확인, 2026-08-27).
        if (clarificationRounds + 1 >= MAX_CLARIFICATION_ROUNDS) {
          setError(
            "입력하신 내용만으로는 어느 메뉴인지 계속 판단하기 어렵습니다 — \"캘린더에 회의 일정 등록해줘\"처럼 메뉴를 직접 언급해서 다시 시도해 주세요."
          );
          setHistory([]);
          setClarificationRounds(0);
          setPendingQuestion(null);
          setMessage("");
          return;
        }
        setHistory((h) => [...h, { role: "user", text }, { role: "assistant", text: res.question }]);
        setClarificationRounds((n) => n + 1);
        setPendingQuestion(res.question);
        setMessage("");
        return;
      }
      function succeed(label: string) {
        router.refresh();
        setPendingQuestion(null);
        setHistory([]);
        setClarificationRounds(0);
        setMessage("");
        setStatusMessage(label);
      }
      function fail(errorMessage: string, draft: AiCommandResult) {
        setError(`자동 등록 실패: ${errorMessage} — 아래에서 확인 후 등록해 주세요.`);
        setFallbackDraft(draft);
      }

      try {
        if (res.tool === "create_calendar_event") {
          const result = await createTeamEventV2(undefined, buildCalendarFormData(res.input));
          if (result?.error) return fail(result.error, res);
          const destLabel =
            res.input.destination === "google" ? "구글 캘린더" : res.input.destination === "both" ? "Calendar와 구글 캘린더" : "Calendar";
          return succeed(`${destLabel}에 "${res.input.title}" 일정을 등록했습니다.`);
        }
        if (res.tool === "create_business_project") {
          const result = await createBusinessProjectV2(undefined, buildBusinessFormData(res.input));
          if (result?.error) return fail(result.error, res);
          return succeed(`SI Business에 "${res.input.title}" 항목을 등록했습니다.`);
        }
        if (res.tool === "create_cooperation_project") {
          const result = await createCooperationProject(undefined, buildCooperationFormData(res.input));
          if (result?.error) return fail(result.error, res);
          return succeed(`Cooperation에 "${res.input.title}" 항목을 등록했습니다.`);
        }
        if (res.tool === "create_marketing_task") {
          const result = await createMarketingTask(undefined, buildMarketingFormData(res.input));
          if (result?.error) return fail(result.error, res);
          return succeed(`Marketing에 "${res.input.title}" 업무를 등록했습니다.`);
        }
        if (res.tool === "send_material_email") {
          const result = await sendMaterialEmailFromAiDraft(res.input);
          if (result?.error) {
            // 대개 수신자 이메일 누락·형식 오류 — 자동발송하지 않고 화면에서
            // 직접 채워 넣게 안내한다(테스트 후 사용자 확인, 2026-08-26: 정상
            // 케이스는 완전 자동발송, 이 경로는 오류 복구용으로만 남긴다).
            window.sessionStorage.setItem(AI_MATERIAL_EMAIL_DRAFT_KEY, JSON.stringify(res.input));
            setError(`자동 발송 실패: ${result.error} — 자료메일발송 화면에서 확인 후 보내주세요.`);
            router.push("/dashboard/material-email");
            return;
          }
          return succeed(`"${res.input.recipients}"로 자료메일을 발송했습니다.`);
        }
        if (res.tool === "create_work_journal_entry") {
          const result = await createWorkJournalEntry(undefined, buildWorkJournalFormData(res.input, currentUserName));
          if (result?.error) return fail(result.error, res);
          return succeed(`Work Journal에 ${res.input.entryDate} 일지를 기록했습니다.`);
        }
        // create_memo: 성공 시 createMemo 내부에서 redirect()가 던져져 여기 아래 코드는
        // 실행되지 않고 그대로 이동한다 — 실패(검증 오류)일 때만 아래에 도달한다.
        const result = await createMemo(undefined, buildMemoFormData(res.input));
        if (result?.error) fail(result.error, res);
      } catch (err) {
        // createMemo 성공 시 Next.js가 던지는 리다이렉트 신호(NEXT_REDIRECT)는 실제
        // 오류가 아니라 페이지 이동 메커니즘이므로 그대로 다시 던져 정상 동작하게 둔다.
        const digest = (err as { digest?: unknown } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
      }
    });
  }

  const showPanel = Boolean(pendingQuestion || statusMessage || error || fallbackDraft);

  return (
    <div className="relative w-full max-w-2xl">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="shrink-0 text-primary">
          ✦
        </span>
        <input
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (statusMessage) setStatusMessage(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            pendingQuestion
              ? "답변을 입력하세요"
              : "AI에게 일정 등록·메모 작성·SI Business/Cooperation/Marketing 등록·업무일지 기록을 시켜보세요"
          }
          disabled={isPending}
          className="min-w-0 flex-1 rounded-full border border-transparent bg-white/95 px-4 py-1.5 text-sm text-ink outline-none focus:border-primary disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !message.trim()}
          className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "AI로 처리"}
        </button>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-md border border-hairline bg-canvas-cream p-3 text-left shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {pendingQuestion && (
                <p className="text-xs text-ink-mute">
                  <span className="font-semibold text-primary">AI</span> {pendingQuestion}
                </p>
              )}
              {statusMessage && <p className="text-xs font-medium text-semantic-success">✓ {statusMessage}</p>}
              {error && <p className="text-xs text-semantic-error">{error}</p>}
            </div>
            {!fallbackDraft && (pendingQuestion || history.length > 0 || error || statusMessage) && (
              <button
                type="button"
                onClick={reset}
                aria-label="닫기"
                className="shrink-0 text-ink-mute hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>
          {fallbackDraft?.tool === "create_calendar_event" && (
            <div className="mt-2">
              <CalendarEventFallbackForm input={fallbackDraft.input} members={members} onDone={reset} />
            </div>
          )}
          {fallbackDraft?.tool === "create_memo" && (
            <div className="mt-2">
              <MemoFallbackForm input={fallbackDraft.input} onDone={reset} />
            </div>
          )}
          {fallbackDraft?.tool === "create_business_project" && (
            <div className="mt-2">
              <BusinessProjectFallbackForm input={fallbackDraft.input} members={members} onDone={reset} />
            </div>
          )}
          {fallbackDraft?.tool === "create_cooperation_project" && (
            <div className="mt-2">
              <CooperationProjectFallbackForm input={fallbackDraft.input} members={members} onDone={reset} />
            </div>
          )}
          {fallbackDraft?.tool === "create_marketing_task" && (
            <div className="mt-2">
              <MarketingTaskFallbackForm input={fallbackDraft.input} members={members} onDone={reset} />
            </div>
          )}
          {fallbackDraft?.tool === "create_work_journal_entry" && (
            <div className="mt-2">
              <WorkJournalFallbackForm input={fallbackDraft.input} currentUserName={currentUserName} onDone={reset} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
