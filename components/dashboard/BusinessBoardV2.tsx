"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BusinessProjectV2, BusinessProjectV2HistoryEntry } from "@/lib/queries/businessProjectsV2";
import type { Quotation } from "@/lib/queries/quotations";
import {
  createBusinessProjectV2,
  updateBusinessProjectV2,
  deleteBusinessProjectV2,
  moveBusinessProjectV2Stage,
  createBusinessProjectV2Comment,
  deleteBusinessProjectV2Comment,
  createBusinessProjectV2HistoryEntry,
  updateBusinessProjectV2HistoryEntry,
} from "@/app/dashboard/actions/businessProjectsV2";
import { MemberMultiSelect } from "@/components/dashboard/MemberMultiSelect";

const STAGES = ["Ⅰ영업진행", "Ⅱ사업제안", "Ⅲ제안서작성", "Ⅳ사업수행", "Ⅴ사업완료"];
const STATUSES = ["시작 전", "진행 중", "완료", "보류", "실패"];
const TERMINAL_STATUSES = new Set(["완료", "실패", "보류"]);

const STATUS_DOT: Record<string, string> = {
  "진행 중": "bg-link-blue",
  "시작 전": "bg-ink-mute",
  완료: "bg-semantic-success",
  보류: "bg-semantic-error",
  실패: "bg-ink-mute",
};

// 상태 배지 배경·글자색 — STATUS_DOT과 같은 색 계열을 pill 형태로 확장해 한눈에 구분되게 한다.
const STATUS_BADGE: Record<string, string> = {
  "진행 중": "bg-canvas-lavender text-link-blue",
  "시작 전": "bg-[#f0f0f2] text-ink-mute",
  완료: "bg-semantic-success/15 text-semantic-success",
  보류: "bg-semantic-error/10 text-semantic-error",
  실패: "bg-[#f0f0f2] text-ink-mute",
};

// 칸반 컬럼 상단 헤더 색 — 단계별로 다르게 구분한다. 카드 안의 단계 선택 드롭다운은
// 색이 너무 많으면 산만해 보인다는 피드백으로 흰색 중립 스타일로 통일했다(사용자 확인).
const STAGE_HEADER_COLOR: Record<string, string> = {
  "Ⅰ영업진행": "bg-[#e8f2ff] text-[#0066cc]",
  "Ⅱ사업제안": "bg-[#f3ecff] text-[#7c3aed]",
  "Ⅲ제안서작성": "bg-[#e0f7f5] text-[#0d9488]",
  "Ⅳ사업수행": "bg-[#fff4e0] text-[#c2740c]",
  "Ⅴ사업완료": "bg-[#e6f7ec] text-[#248a3d]",
};

function stageHeaderColor(stage: string): string {
  return STAGE_HEADER_COLOR[stage] ?? "bg-background text-ink";
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function ProjectForm({
  project,
  members,
  onDone,
}: {
  project: BusinessProjectV2 | null;
  members: string[];
  onDone: () => void;
}) {
  const action = project ? updateBusinessProjectV2 : createBusinessProjectV2;
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        onDone();
      }}
      className="flex flex-col gap-3 rounded-sm border border-hairline bg-canvas-cream p-4"
    >
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          사업명 *
          <input
            name="title"
            defaultValue={project?.title ?? ""}
            required
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          단계
          <select
            name="stage"
            defaultValue={project?.stage ?? ""}
            className="rounded-sm border border-hairline bg-background px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="">미분류</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          진행 상태
          <select
            name="status"
            defaultValue={project?.status ?? "시작 전"}
            className="rounded-sm border border-hairline bg-background px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          발주기관
          <input
            name="orgName"
            defaultValue={project?.orgName ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          참여 형태
          <input
            name="participationType"
            defaultValue={project?.participationType ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          사업 유형
          <input
            name="workType"
            defaultValue={project?.workType ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          결과
          <input
            name="result"
            defaultValue={project?.result ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          금액(원)
          <input
            name="amount"
            type="number"
            defaultValue={project?.amount ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          진행률(%)
          <input
            name="progressRate"
            type="number"
            defaultValue={project?.progressRate ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          제출일
          <input
            name="submissionDate"
            type="date"
            defaultValue={toDateInputValue(project?.submissionDate ?? null)}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          제출 방법
          <input
            name="submissionMethod"
            defaultValue={project?.submissionMethod ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          발표일
          <input
            name="presentationDate"
            type="date"
            defaultValue={toDateInputValue(project?.presentationDate ?? null)}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          공사 시작일
          <input
            name="constructionStart"
            type="date"
            defaultValue={toDateInputValue(project?.constructionStart ?? null)}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute">
          공사 종료일
          <input
            name="constructionEnd"
            type="date"
            defaultValue={toDateInputValue(project?.constructionEnd ?? null)}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          공사 내용
          <input
            name="constructionContent"
            defaultValue={project?.constructionContent ?? ""}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <div className="sm:col-span-2">
          <MemberMultiSelect name="assignees" label="담당자" members={members} defaultValue={project?.assignees ?? []} />
        </div>
        <label className="flex flex-col gap-1 text-xs text-ink-mute sm:col-span-2">
          참고 사항
          <textarea
            name="notes"
            defaultValue={project?.notes ?? ""}
            rows={3}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
      </div>
      {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "저장 중..." : project ? "수정 저장" : "사업 추가"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryEntryRow({ entry }: { entry: BusinessProjectV2HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const action = updateBusinessProjectV2HistoryEntry.bind(null, entry.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const firstLine = entry.content.split("\n")[0];
  const hasMore = entry.content.includes("\n");
  const wasEdited = entry.updatedAt !== entry.createdAt;

  if (editing) {
    return (
      <form
        action={async (formData) => {
          await formAction(formData);
          setEditing(false);
        }}
        className="flex flex-col gap-2 rounded-sm border border-hairline bg-background p-3 text-sm"
      >
        <textarea
          name="content"
          required
          defaultValue={entry.content}
          rows={4}
          className="rounded-sm border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-1 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-hairline px-4 py-1 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
          >
            취소
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-sm border border-hairline bg-background p-3 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className={`min-w-0 flex-1 text-ink ${expanded ? "whitespace-pre-wrap" : "truncate"}`}>
          {expanded ? entry.content : firstLine}
          {!expanded && hasMore && <span className="text-ink-mute"> …</span>}
        </span>
        <span className="shrink-0 text-xs text-ink-mute">{formatDateTime(entry.createdAt)}</span>
      </button>
      {expanded && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-mute">
          <span>
            {entry.authorEmail}
            {wasEdited && <span className="ml-1">(수정됨)</span>}
          </span>
          {entry.isOwn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="text-link-blue hover:underline"
            >
              수정
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectHistory({ project }: { project: BusinessProjectV2 }) {
  const action = createBusinessProjectV2HistoryEntry.bind(null, project.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-hairline bg-canvas-cream p-4">
      <div>
        <strong className="text-sm font-bold text-ink">히스토리</strong>
        <p className="mt-0.5 text-xs text-ink-mute">
          진행 상황·변경 사항을 시간순으로 남깁니다. 등록한 기록은 삭제할 수 없지만, 본인이 남긴
          기록은 수정할 수 있습니다.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {project.history.map((h) => (
          <HistoryEntryRow key={h.id} entry={h} />
        ))}
        {project.history.length === 0 && (
          <p className="text-sm text-ink-mute">아직 등록된 히스토리가 없습니다.</p>
        )}
      </div>
      <form action={formAction} className="flex flex-col gap-2">
        <textarea
          name="content"
          required
          rows={3}
          placeholder="예: 발주처와 통화, 견적 재작성 요청"
          className="rounded-sm border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-5 py-1.5 text-sm font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "등록 중..." : "히스토리 등록"}
        </button>
      </form>
    </div>
  );
}

/** 산출내역 작성 화면에서 이 사업(SI Business 프로젝트)에 연결해 둔 산출내역
 * 목록 — 산출내역 쪽이 연결의 출발점이라 여기서는 조회만 한다(사용자 확인,
 * 2026-08-27). */
function ProjectQuotations({ project, quotations }: { project: BusinessProjectV2; quotations: Quotation[] }) {
  const linked = quotations.filter((q) => q.businessProjectId === project.id);

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-hairline bg-canvas-cream p-4">
      <div>
        <strong className="text-sm font-bold text-ink">연결된 산출내역</strong>
        <p className="mt-0.5 text-xs text-ink-mute">
          산출내역 작성 화면의 &ldquo;연결 사업&rdquo;에서 이 프로젝트를 선택하면 여기 표시됩니다.
        </p>
      </div>
      {linked.length === 0 ? (
        <p className="text-sm text-ink-mute">연결된 산출내역이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {linked.map((q) => (
            <div
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-hairline bg-background px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-link-blue">{q.quoteNumber}</span>
                <span className="truncate font-medium text-ink">{q.customerName}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    q.status === "final" ? "bg-semantic-success/15 text-semantic-success" : "bg-[#f0f0f2] text-ink-mute"
                  }`}
                >
                  {q.status === "final" ? "최종" : "임시"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-bold tabular-nums text-ink">{Math.round(q.totalAmount).toLocaleString("ko-KR")}원</span>
                <Link
                  href={`/dashboard/quotations/${q.id}/print`}
                  target="_blank"
                  className="rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium text-ink hover:bg-[#f7f7f8]"
                >
                  인쇄
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      <Link href="/dashboard/quotations" className="w-fit text-xs text-link-blue hover:underline">
        산출내역 관리에서 새로 만들거나 연결 변경하기 →
      </Link>
    </div>
  );
}

function ProjectComments({ project }: { project: BusinessProjectV2 }) {
  const router = useRouter();
  const action = createBusinessProjectV2Comment.bind(null, project.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [, startTransition] = useTransition();

  function handleDelete(commentId: string) {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    startTransition(async () => {
      await deleteBusinessProjectV2Comment(commentId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-hairline bg-canvas-cream p-4">
      <strong className="text-sm font-bold text-ink">댓글 {project.comments.length}개</strong>
      <div className="flex flex-col gap-2">
        {project.comments.map((c) => (
          <div key={c.id} className="rounded-sm border border-hairline bg-background p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink">{c.authorEmail}</span>
              <div className="flex items-center gap-2 text-xs text-ink-mute">
                <span>{formatDateTime(c.createdAt)}</span>
                {c.canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="text-semantic-error hover:underline"
                  >
                    삭제
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-ink">{c.content}</p>
          </div>
        ))}
        {project.comments.length === 0 && (
          <p className="text-sm text-ink-mute">아직 댓글이 없습니다. 의견을 남겨보세요.</p>
        )}
      </div>
      <form action={formAction} className="flex flex-col gap-2">
        <textarea
          name="content"
          required
          rows={3}
          placeholder="의견을 남겨주세요"
          className="rounded-sm border border-hairline px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        {state?.error && <p className="text-sm text-semantic-error">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-primary px-5 py-1.5 text-sm font-bold text-white hover:bg-primary-press disabled:opacity-50"
        >
          {pending ? "등록 중..." : "댓글 등록"}
        </button>
      </form>
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
}: {
  project: BusinessProjectV2;
  onEdit: () => void;
}) {
  const [, startTransition] = useTransition();
  const dotColor = STATUS_DOT[project.status] || "bg-ink-mute";
  const statusBadge = STATUS_BADGE[project.status] || "bg-[#f0f0f2] text-ink-mute";
  const date = formatDate(project.submissionDate);

  function handleStageChange(stage: string) {
    startTransition(() => {
      void moveBusinessProjectV2Stage(project.id, stage || null);
    });
  }

  return (
    <div
      onClick={onEdit}
      className="flex cursor-pointer flex-col gap-1.5 rounded-lg border border-hairline bg-background p-2 text-xs hover:border-primary"
    >
      <div className="flex flex-col gap-1">
        <span className="truncate font-medium text-ink" title={project.title}>
          {project.title}
        </span>
        <span className={`flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium ${statusBadge}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          {project.status}
        </span>
        {date && <span className="truncate text-ink-mute">{date}</span>}
        {project.orgName && (
          <span className="truncate text-ink-mute" title={project.orgName}>
            {project.orgName}
          </span>
        )}
      </div>
      <select
        value={project.stage ?? ""}
        onChange={(e) => handleStageChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="rounded-sm border border-hairline bg-canvas-cream px-1.5 py-1 text-[11px] font-medium text-ink-mute outline-none focus:border-primary"
      >
        <option value="">미분류</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

function BusinessListView({
  projects,
  onEdit,
}: {
  projects: BusinessProjectV2[];
  onEdit: (project: BusinessProjectV2) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-sm border border-hairline bg-canvas-cream">
      <table className="w-full text-sm">
        <thead className="bg-background text-left text-ink-mute">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 font-medium">상태</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium">사업명</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium">단계</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium">발주기관</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium">담당자</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium">제출일</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr
              key={p.id}
              onClick={() => onEdit(p)}
              className="cursor-pointer border-t border-hairline hover:bg-[#f7f7f8]"
            >
              <td className="whitespace-nowrap px-4 py-2">
                <span
                  className={`flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${
                    STATUS_BADGE[p.status] || "bg-[#f0f0f2] text-ink-mute"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status] || "bg-ink-mute"}`} />
                  {p.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <span className="text-left text-link-blue hover:underline">{p.title}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <span className="inline-flex w-fit whitespace-nowrap rounded-md border border-hairline bg-canvas-cream px-1.5 py-0.5 text-xs font-medium text-ink-mute">
                  {p.stage ?? "미분류"}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-ink-mute">{p.orgName ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-2 text-ink-mute">{p.assignees.join(", ") || "-"}</td>
              <td className="whitespace-nowrap px-4 py-2 text-ink-mute">{formatDate(p.submissionDate) ?? "-"}</td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-mute">
                조건에 맞는 사업이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function BusinessBoardV2({
  projects,
  members,
  quotations,
}: {
  projects: BusinessProjectV2[];
  members: string[];
  quotations: Quotation[];
}) {
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  // 선택한 프로젝트 객체를 그대로 담아두면 댓글 등록 후 revalidate로 projects가
  // 새로고침돼도 이 스냅샷은 갱신되지 않는다 — id만 들고 있다가 매 렌더마다
  // projects에서 다시 찾아 항상 최신 데이터(새 댓글 포함)를 보여준다.
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const editingProject = editingId && editingId !== "new" ? (projects.find((p) => p.id === editingId) ?? null) : null;
  const [, startTransition] = useTransition();

  // 상태 요약 카드로 필터링 중이면 "완료·보류 포함" 체크와 무관하게 그 상태만 보여준다
  // (완료 카드를 눌렀는데 완료 항목이 숨겨져 있으면 빈 목록처럼 보이는 문제를 막는다).
  const visible = useMemo(() => {
    if (statusFilter) return projects.filter((p) => p.status === statusFilter);
    return showAll ? projects : projects.filter((p) => !TERMINAL_STATUSES.has(p.status));
  }, [projects, showAll, statusFilter]);

  const byStage = useMemo(() => {
    const map = new Map<string, BusinessProjectV2[]>();
    for (const stage of STAGES) map.set(stage, []);
    const etc: BusinessProjectV2[] = [];
    for (const p of visible) {
      if (p.stage && map.has(p.stage)) {
        map.get(p.stage)!.push(p);
      } else {
        etc.push(p);
      }
    }
    if (etc.length > 0) map.set("미분류", etc);
    return map;
  }, [visible]);

  // 상단 요약은 완료·보류 포함 토글과 무관하게 전체 기준으로 센다 — 필터로 숨겨진
  // 항목도 전체 현황 파악에는 필요하기 때문.
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of STATUSES) counts.set(s, 0);
    for (const p of projects) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    return counts;
  }, [projects]);

  function handleDelete(id: string) {
    if (!window.confirm("이 사업 항목을 삭제할까요?")) return;
    startTransition(() => {
      void deleteBusinessProjectV2(id);
    });
    setEditingId(null);
  }

  const isEditing = editingId === "new" || Boolean(editingProject);

  return (
    <div className="flex flex-col gap-4">
      {isEditing ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="flex w-fit items-center gap-1 text-sm font-medium text-ink-mute hover:text-ink"
          >
            ← 목록으로
          </button>
          {editingId === "new" && <ProjectForm project={null} members={members} onDone={() => setEditingId(null)} />}
          {editingProject && (
            <>
              <ProjectForm project={editingProject} members={members} onDone={() => setEditingId(null)} />
              <button
                type="button"
                onClick={() => handleDelete(editingProject.id)}
                className="w-fit rounded-lg border border-hairline px-4 py-1.5 text-xs font-medium text-semantic-error hover:bg-[#f7f7f8]"
              >
                이 사업 삭제
              </button>
              <ProjectQuotations project={editingProject} quotations={quotations} />
              <ProjectHistory project={editingProject} />
              <ProjectComments project={editingProject} />
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className={`flex flex-col gap-1 rounded-sm border bg-primary p-3 text-left text-white transition-shadow ${
                statusFilter === null ? "border-current shadow-[0_0_0_2px_currentColor]" : "border-primary"
              }`}
            >
              <span className="text-xs font-semibold">전체</span>
              <span className="text-2xl font-bold tracking-tight">{projects.length.toLocaleString("ko-KR")}</span>
            </button>
            {STATUSES.map((s) => {
              const badge = STATUS_BADGE[s] || "bg-[#f0f0f2] text-ink-mute";
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter((prev) => (prev === s ? null : s))}
                  className={`flex flex-col gap-1 rounded-sm border p-3 text-left transition-shadow ${badge} ${
                    active ? "border-current shadow-[0_0_0_2px_currentColor]" : "border-hairline"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[s] || "bg-ink-mute"}`} />
                    {s}
                  </span>
                  <span className="text-2xl font-bold tracking-tight">
                    {(statusCounts.get(s) ?? 0).toLocaleString("ko-KR")}
                  </span>
                </button>
              );
            })}
          </div>
          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className="w-fit text-xs text-link-blue hover:underline"
            >
              &ldquo;{statusFilter}&rdquo; 필터 해제
            </button>
          )}

          <div className="flex flex-col gap-4 rounded-sm border border-hairline bg-canvas-cream p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-ink-mute">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                완료·보류 포함
              </label>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-background p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setView("board")}
                    className={`rounded-lg px-3 py-1 transition-colors ${
                      view === "board" ? "bg-primary text-white shadow-sm" : "text-ink-mute hover:text-ink"
                    }`}
                  >
                    목록
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className={`rounded-lg px-3 py-1 transition-colors ${
                      view === "list" ? "bg-primary text-white shadow-sm" : "text-ink-mute hover:text-ink"
                    }`}
                  >
                    리스트
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingId("new")}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press"
                >
                  + 새 사업 추가
                </button>
              </div>
            </div>

            {view === "board" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {Array.from(byStage.entries()).map(([stage, items]) => (
                  <div key={stage} className="flex min-w-0 flex-col gap-2">
                    <div
                      className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-semibold ${stageHeaderColor(stage)}`}
                    >
                      <span className="truncate">{stage}</span>
                      <span className="shrink-0 font-normal opacity-70">{items.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {items.map((p) => (
                        <ProjectCard key={p.id} project={p} onEdit={() => setEditingId(p.id)} />
                      ))}
                      {items.length === 0 && (
                        <div className="rounded-lg border border-dashed border-hairline p-2 text-center text-xs text-ink-mute">
                          없음
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <BusinessListView projects={visible} onEdit={(p) => setEditingId(p.id)} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
