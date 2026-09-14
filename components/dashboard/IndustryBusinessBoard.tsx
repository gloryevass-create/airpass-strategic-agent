"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { NavIcon, type IconName } from "@/components/icons/NavIcon";
import type { BusinessProjectV2, BusinessProjectV2HistoryEntry } from "@/lib/queries/businessProjectsV2";
import type { Quotation } from "@/lib/queries/quotations";
import {
  createBusinessProjectV2,
  updateBusinessProjectV2,
  deleteBusinessProjectV2,
  moveBusinessProjectV2Stage,
  toggleBusinessProjectV2Favorite,
  createBusinessProjectV2Comment,
  deleteBusinessProjectV2Comment,
  createBusinessProjectV2HistoryEntry,
  updateBusinessProjectV2HistoryEntry,
} from "@/app/dashboard/actions/businessProjectsV2";

// SI Business(기존 화면, /dashboard/business2)와 완전히 같은 데이터·서버
// 액션을 쓴다 — SI Business 2는 Claude Design "Industry" 테마로 다시 그린
// 같은 사업 목록일 뿐, 별도 데이터가 아니다(사용자 확인, 2026-08-28).
const STAGES = ["Ⅰ영업진행", "Ⅱ사업제안", "Ⅲ제안서작성", "Ⅳ사업수행", "Ⅴ사업완료"];
const STATUSES = ["시작 전", "진행 중", "완료", "보류", "실패"];
const TERMINAL_STATUSES = new Set(["완료", "실패", "보류"]);

// 칸반 단계 헤더의 로마숫자 코드 대신 아이콘으로 표시(2026-09-12, 사용자 확인).
const STAGE_ICONS: Record<string, IconName> = {
  영업진행: "megaphone",
  사업제안: "chat",
  제안서작성: "document",
  사업수행: "briefcase",
  사업완료: "checkSquare",
  미분류: "tag",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
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

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatCurrency(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

function stageIndex(stage: string): number {
  const i = STAGES.indexOf(stage);
  return i === -1 ? STAGES.length : i;
}

/** 담당자 다중 선택 — MemberMultiSelect(Tailwind 톤)와 동일한 역할이지만
 * Industry 테마의 알약형 태그(.tag-chip)로 새로 그렸다(색이 섞이면 이 페이지만의
 * 통일된 룩이 깨지기 때문, 2026-08-28). */
function ManagerChips({
  name,
  members,
  defaultValue,
}: {
  name: string;
  members: string[];
  defaultValue: string[];
}) {
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
      <label>담당자</label>
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

// 기본값을 브라우저에 저장해두는 키 — 팀 전체가 아니라 이 브라우저를 쓰는
// 사람 개인의 취향이라 DB가 아니라 localStorage면 충분하다(사용자 확인,
// 2026-08-28 — "이 폴트를 저장할 수 있게 하는 기능"으로 명시적으로 요청받음).
const DEFAULTS_STORAGE_KEY = "si-business-2:defaults";
const HARD_DEFAULTS = { showArchived: false, view: "kanban" as const };

function loadSavedDefaults(): { showArchived: boolean; view: "kanban" | "list" } | null {
  try {
    const raw = window.localStorage.getItem(DEFAULTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.showArchived !== "boolean") return null;
    if (parsed.view !== "kanban" && parsed.view !== "list") return null;
    return { showArchived: parsed.showArchived, view: parsed.view };
  } catch {
    return null;
  }
}

/** 디자인 목업(Claude Design)의 속성 미리보기 바("showArchivedDefault" 토글 +
 * "defaultView" 드롭다운 + Reset/Save as defaults 버튼)를 실제 페이지 상단에도
 * 그대로 재현한 것 — 아래쪽 "완료·보류 포함"/목록·리스트 버튼과 같은 state를
 * 공유해 항상 서로 일치한다. "Save as defaults"는 지금 값을 이 브라우저에 저장해
 * 다음에 이 페이지를 열 때도 그대로 적용되게 하고, "Reset"은 저장된 값을 지우고
 * 원래 기본값(완료·보류 미포함, 칸반)으로 되돌린다(사용자 확인, 2026-08-28). */
function TopSettingsBar({
  showArchived,
  onShowArchivedChange,
  view,
  onViewChange,
}: {
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  view: "kanban" | "list";
  onViewChange: (v: "kanban" | "list") => void;
}) {
  const [savedNotice, setSavedNotice] = useState(false);

  function handleSave() {
    window.localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify({ showArchived, view }));
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1500);
  }

  function handleReset() {
    window.localStorage.removeItem(DEFAULTS_STORAGE_KEY);
    onShowArchivedChange(HARD_DEFAULTS.showArchived);
    onViewChange(HARD_DEFAULTS.view);
  }

  return (
    <div
      className="board-top-bar"
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
          <span>showArchivedDefault</span>
          <span
            role="switch"
            aria-checked={showArchived}
            onClick={() => onShowArchivedChange(!showArchived)}
            style={{
              position: "relative",
              width: 30,
              height: 16,
              borderRadius: 999,
              background: showArchived ? "#3b82f6" : "#d1d5db",
              transition: "background 0.15s",
              flex: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: showArchived ? 16 : 2,
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
            onChange={(e) => onViewChange(e.target.value as "kanban" | "list")}
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
            <option value="kanban">kanban</option>
            <option value="list">list</option>
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

function StatusTag({ status }: { status: string }) {
  const cls = status === "진행 중" ? "tag tag-accent" : TERMINAL_STATUSES.has(status) ? "tag tag-neutral" : "tag tag-outline";
  return <span className={cls}>{status}</span>;
}

/* ─────────────────────────── 새 사업 추가 다이얼로그 ─────────────────────────── */

function AddProjectDialog({ members, onClose }: { members: string[]; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createBusinessProjectV2, undefined);
  const wasPendingRef = useRef(false);

  // useActionState의 dispatch는 서버 액션 결과를 그 자리에서 돌려주지 않는다 —
  // pending이 true→false로 바뀌는 순간 에러가 없을 때만 닫는다(사용자 확인,
  // 2026-08-28 — 산출내역 저장 폼에서 같은 문제를 먼저 고친 패턴 재사용).
  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) onClose();
    wasPendingRef.current = pending;
  }, [pending, state, onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        style={{ width: "min(640px,100%)", maxHeight: "88vh", overflowY: "auto", background: "#ffffff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          새 사업 추가
        </div>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div className="field">
            <label>사업명 *</label>
            <input className="input" name="title" required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div className="field">
              <label>단계</label>
              <select className="input" name="stage" defaultValue="">
                <option value="">미분류</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>진행 상태</label>
              <select className="input" name="status" defaultValue="시작 전">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>발주기관</label>
              <input className="input" name="orgName" />
            </div>
            <div className="field">
              <label>참여 형태</label>
              <input className="input" name="participationType" />
            </div>
            <div className="field">
              <label>사업 유형</label>
              <input className="input" name="workType" />
            </div>
            <div className="field">
              <label>결과</label>
              <input className="input" name="result" />
            </div>
            <div className="field">
              <label>금액(원)</label>
              <input className="input" type="number" name="amount" />
            </div>
            <div className="field">
              <label>진행률(%)</label>
              <input className="input" type="number" name="progressRate" />
            </div>
            <div className="field">
              <label>제출일</label>
              <input className="input" type="date" name="submissionDate" />
            </div>
            <div className="field">
              <label>제출 방법</label>
              <input className="input" name="submissionMethod" />
            </div>
            <div className="field">
              <label>발표일</label>
              <input className="input" type="date" name="presentationDate" />
            </div>
            <div className="field">
              <label>공사 시작일</label>
              <input className="input" type="date" name="constructionStart" />
            </div>
            <div className="field">
              <label>공사 종료일</label>
              <input className="input" type="date" name="constructionEnd" />
            </div>
          </div>
          <div className="field">
            <label>공사 내용</label>
            <input className="input" name="constructionContent" />
          </div>
          <ManagerChips name="assignees" members={members} defaultValue={[]} />
          <div className="field">
            <label>참고 사항</label>
            <textarea className="input" name="notes" rows={3} />
          </div>
          {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "저장 중..." : "사업 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── 연결된 산출내역 ─────────────────────────── */

function ConnectedQuotations({ project, quotations }: { project: BusinessProjectV2; quotations: Quotation[] }) {
  const linked = quotations.filter((q) => q.businessProjectId === project.id);
  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-5)", marginBottom: "var(--space-6)" }}>
      <h4 style={{ margin: "0 0 4px" }}>연결된 산출내역</h4>
      <p className="text-muted" style={{ margin: "0 0 var(--space-3)", fontSize: 12 }}>
        산출내역 작성 화면의 &ldquo;연결 사업&rdquo;에서 이 프로젝트를 선택하면 여기 표시됩니다.
      </p>
      {linked.length === 0 ? (
        <p style={{ fontSize: 13 }}>연결된 산출내역이 없습니다.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {linked.map((q) => (
            <div
              key={q.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                border: "1px solid var(--color-divider)",
                padding: "var(--space-2) var(--space-3)",
                fontSize: 13,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="tag tag-outline">{q.quoteNumber}</span>
                <span>{q.customerName}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>{formatCurrency(q.totalAmount)}원</span>
                <Link href={`/quote/${q.id}`} target="_blank" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }}>
                  인쇄
                </Link>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 히스토리 ─────────────────────────── */

function HistoryRow({ entry }: { entry: BusinessProjectV2HistoryEntry }) {
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
        style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--color-divider)", padding: "var(--space-3)" }}
      >
        <textarea className="input" name="content" required defaultValue={entry.content} rows={4} />
        {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
            취소
          </button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid var(--color-divider)", padding: "var(--space-2) 0", fontSize: 13 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "none",
          border: 0,
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span style={{ minWidth: 0, flex: 1, whiteSpace: expanded ? "pre-wrap" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {expanded ? entry.content : firstLine}
          {!expanded && hasMore && <span className="text-muted"> …</span>}
        </span>
        <span className="text-muted" style={{ flex: "none", fontSize: 11 }}>
          {formatDateTime(entry.createdAt)}
        </span>
      </button>
      {expanded && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 }} className="text-muted">
          <span>
            {entry.authorEmail}
            {wasEdited && <span style={{ marginLeft: 4 }}>(수정됨)</span>}
          </span>
          {entry.isOwn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: "2px 6px", minHeight: "auto" }}
            >
              수정
            </button>
          )}
        </div>
      )}
      {expanded && entry.attachments.length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {entry.attachments.map((a) =>
            a.url ? (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="tag tag-outline"
                style={{ fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                onClick={(e) => e.stopPropagation()}
              >
                📎 {a.fileName}
              </a>
            ) : (
              <span key={a.id} className="tag tag-outline" style={{ fontSize: 11 }}>
                {a.fileName}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

function HistorySection({ project }: { project: BusinessProjectV2 }) {
  const action = createBusinessProjectV2HistoryEntry.bind(null, project.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-5)", marginBottom: "var(--space-6)" }}>
      <h4 style={{ margin: "0 0 4px" }}>히스토리</h4>
      <p className="text-muted" style={{ margin: "0 0 var(--space-3)", fontSize: 12 }}>
        진행 상황·변경 사항을 시간순으로 남깁니다. 등록한 기록은 삭제할 수 없지만, 본인이 남긴 기록은 수정할 수 있습니다.
      </p>
      {project.history.length === 0 ? (
        <p style={{ fontSize: 13, marginBottom: "var(--space-3)" }}>아직 등록된 히스토리가 없습니다.</p>
      ) : (
        <div style={{ marginBottom: "var(--space-3)" }}>
          {project.history.map((h) => (
            <HistoryRow key={h.id} entry={h} />
          ))}
        </div>
      )}
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea className="input" name="content" required rows={3} placeholder="예: 발주처와 통화, 견적 재작성 요청" />
        <input
          className="input"
          type="file"
          name="files"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
        />
        <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
          이미지·PDF·Office 문서·ZIP, 파일당 12MB 이하, 최대 5개
        </p>
        {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
        <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={pending}>
          {pending ? "등록 중..." : "히스토리 등록"}
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────── 댓글 ─────────────────────────── */

function CommentsSection({ project }: { project: BusinessProjectV2 }) {
  const action = createBusinessProjectV2Comment.bind(null, project.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [, startTransition] = useTransition();

  function handleDelete(commentId: string) {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    startTransition(() => {
      void deleteBusinessProjectV2Comment(commentId);
    });
  }

  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-5)" }}>
      <h4 style={{ margin: "0 0 var(--space-3)" }}>댓글 {project.comments.length}개</h4>
      {project.comments.length === 0 ? (
        <p style={{ fontSize: 13 }}>아직 댓글이 없습니다. 의견을 남겨보세요.</p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          {project.comments.map((c) => (
            <div key={c.id} className="card blueprint" style={{ fontSize: 13 }}>
              <i className="corner tl" />
              <i className="corner tr" />
              <i className="corner bl" />
              <i className="corner br" />
              <div className="text-muted" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{c.authorEmail}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  {formatDateTime(c.createdAt)}
                  {c.isOwn && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      style={{ background: "none", border: 0, padding: 0, color: "var(--color-accent-900)", cursor: "pointer", font: "inherit", fontSize: 11 }}
                    >
                      삭제
                    </button>
                  )}
                </span>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
            </div>
          ))}
        </div>
      )}
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "var(--space-3)" }}>
        <textarea className="input" name="content" required rows={3} placeholder="의견을 남겨주세요" />
        {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
        <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={pending}>
          {pending ? "등록 중..." : "댓글 등록"}
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────── 상세/수정 화면 ─────────────────────────── */

function ProjectDetail({
  project,
  members,
  quotations,
  onClose,
}: {
  project: BusinessProjectV2;
  members: string[];
  quotations: Quotation[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateBusinessProjectV2, undefined);
  const wasPendingRef = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) onClose();
    wasPendingRef.current = pending;
  }, [pending, state, onClose]);

  function handleDelete() {
    if (!window.confirm("이 사업 항목을 삭제할까요?")) return;
    startTransition(() => {
      void deleteBusinessProjectV2(project.id);
    });
    onClose();
  }

  return (
    <div>
      <button type="button" className="btn btn-ghost" onClick={onClose} style={{ marginBottom: "var(--space-4)", paddingInline: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        목록으로
      </button>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          background: "#ffffff",
          border: "1px solid var(--color-divider)",
          borderRadius: 8,
          boxShadow: "var(--shadow-sm)",
          padding: "var(--space-4)",
        }}
      >
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <input type="hidden" name="id" value={project.id} />
        <div className="field">
          <label>사업명 *</label>
          <input className="input" name="title" defaultValue={project.title} required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <div className="field">
            <label>단계</label>
            <select className="input" name="stage" defaultValue={project.stage ?? ""}>
              <option value="">미분류</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>진행 상태</label>
            <select className="input" name="status" defaultValue={project.status}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>발주기관</label>
            <input className="input" name="orgName" defaultValue={project.orgName ?? ""} />
          </div>
          <div className="field">
            <label>참여 형태</label>
            <input className="input" name="participationType" defaultValue={project.participationType ?? ""} />
          </div>
          <div className="field">
            <label>사업 유형</label>
            <input className="input" name="workType" defaultValue={project.workType ?? ""} />
          </div>
          <div className="field">
            <label>결과</label>
            <input className="input" name="result" defaultValue={project.result ?? ""} />
          </div>
          <div className="field">
            <label>금액(원)</label>
            <input className="input" type="number" name="amount" defaultValue={project.amount ?? ""} />
          </div>
          <div className="field">
            <label>진행률(%)</label>
            <input className="input" type="number" name="progressRate" defaultValue={project.progressRate ?? ""} />
          </div>
          <div className="field">
            <label>제출일</label>
            <input className="input" type="date" name="submissionDate" defaultValue={toDateInputValue(project.submissionDate)} />
          </div>
          <div className="field">
            <label>제출 방법</label>
            <input className="input" name="submissionMethod" defaultValue={project.submissionMethod ?? ""} />
          </div>
          <div className="field">
            <label>발표일</label>
            <input className="input" type="date" name="presentationDate" defaultValue={toDateInputValue(project.presentationDate)} />
          </div>
          <div className="field">
            <label>공사 시작일</label>
            <input className="input" type="date" name="constructionStart" defaultValue={toDateInputValue(project.constructionStart)} />
          </div>
          <div className="field">
            <label>공사 종료일</label>
            <input className="input" type="date" name="constructionEnd" defaultValue={toDateInputValue(project.constructionEnd)} />
          </div>
        </div>
        <div className="field">
          <label>공사 내용</label>
          <input className="input" name="constructionContent" defaultValue={project.constructionContent ?? ""} />
        </div>
        <ManagerChips name="assignees" members={members} defaultValue={project.assignees} />
        <div className="field">
          <label>참고 사항</label>
          <textarea className="input" name="notes" defaultValue={project.notes ?? ""} rows={3} />
        </div>

        {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "저장 중..." : "수정 저장"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            취소
          </button>
        </div>
      </form>

      <button type="button" onClick={handleDelete} className="btn btn-secondary btn-danger" style={{ alignSelf: "flex-start" }}>
        이 사업 삭제
      </button>

      <ConnectedQuotations project={project} quotations={quotations} />
      <HistorySection project={project} />
      <CommentsSection project={project} />
      </div>
    </div>
  );
}

/* ─────────────────────────── 칸반 카드 ─────────────────────────── */

function KanbanCard({
  project,
  onOpen,
  onDragStart,
  onDragEnd,
  onToggleFavorite,
}: {
  project: BusinessProjectV2;
  onOpen: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onToggleFavorite: (id: string) => void;
}) {
  const [, startTransition] = useTransition();

  function handleStageChange(stage: string) {
    startTransition(() => {
      void moveBusinessProjectV2Stage(project.id, stage || null);
    });
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="kanban-card card elev-sm"
      style={{ background: project.isFavorite ? "var(--color-accent-100)" : undefined }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(project.id);
          }}
          title={project.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          className="btn btn-ghost btn-icon"
          style={{ color: project.isFavorite ? "#e3a51b" : undefined, fontSize: 14, padding: 0, minHeight: "auto", flex: "none" }}
        >
          {project.isFavorite ? "★" : "☆"}
        </button>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-700)" strokeWidth="1.5" style={{ flex: "none" }}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span onClick={onOpen} style={{ cursor: "pointer" }} className="detail-link">
          {project.title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <StatusTag status={project.status} />
        {project.orgName && (
          <span className="text-muted" style={{ fontSize: 11 }}>
            {project.orgName}
          </span>
        )}
      </div>
      <select
        className="input"
        value={project.stage ?? ""}
        onChange={(e) => handleStageChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 10,
          minHeight: 20,
          padding: "1px 4px",
          marginTop: "var(--space-2)",
          background: "transparent",
          borderColor: "transparent",
          color: "var(--color-accent-700)",
        }}
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

/* ─────────────────────────── 메인 보드 ─────────────────────────── */

export function IndustryBusinessBoard({
  projects,
  members,
  quotations,
}: {
  projects: BusinessProjectV2[];
  members: string[];
  quotations: Quotation[];
}) {
  const [showArchived, setShowArchived] = useState(HARD_DEFAULTS.showArchived);
  const [view, setView] = useState<"kanban" | "list">(HARD_DEFAULTS.view);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  // 제품 카탈로그의 즐겨찾기와 동일한 낙관적 업데이트 패턴(2026-09-12) — 클릭
  // 즉시 화면에 반영하고, revalidatePath로 서버 데이터가 다시 내려올 때 자연히
  // 합쳐진다.
  const [favoriteOverrides, setFavoriteOverrides] = useState<Map<string, boolean>>(new Map());

  const projectsWithFavorites = useMemo(
    () =>
      projects.map((p) => (favoriteOverrides.has(p.id) ? { ...p, isFavorite: favoriteOverrides.get(p.id)! } : p)),
    [projects, favoriteOverrides]
  );

  function handleToggleFavorite(id: string) {
    const current = projectsWithFavorites.find((p) => p.id === id)?.isFavorite ?? false;
    setFavoriteOverrides((prev) => new Map(prev).set(id, !current));
    startTransition(async () => {
      await toggleBusinessProjectV2Favorite(id);
    });
  }

  // 저장된 기본값은 브라우저에서만 읽을 수 있어(localStorage) 마운트 후에
  // 반영한다 — 처음부터 읽어서 초기 state로 쓰면 서버가 렌더링한 HTML(항상
  // 하드코딩된 기본값)과 클라이언트가 달라져 하이드레이션 경고가 난다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadSavedDefaults();
    if (saved) {
      setShowArchived(saved.showArchived);
      setView(saved.view);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 2026-09-12에는 모바일에서 view를 "list"로 강제하고 전환 버튼도 숨겼었는데,
  // 두 보기 모두 모바일에서 쓰고 싶다는 요청(2026-09-14)으로 되돌렸다 — 대신
  // 칸반은 모바일에서 CSS(.kanban-grid)로 1열로 쌓아 단계별 섹션이 위에서
  // 아래로 이어지는 형태가 되고, 리스트는 표 대신 카드형으로 바뀐다
  // (components/industryTheme.css). 칸반 카드의 단계 이동은 모바일에서
  // 드래그가 안 먹지만 카드 안 <select>로 그대로 바꿀 수 있다.

  const editingProject = editingId ? (projects.find((p) => p.id === editingId) ?? null) : null;

  const visible = useMemo(
    () =>
      showArchived
        ? projectsWithFavorites
        : projectsWithFavorites.filter((p) => !TERMINAL_STATUSES.has(p.status)),
    [projectsWithFavorites, showArchived]
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of STATUSES) m.set(s, 0);
    for (const p of projects) m.set(p.status, (m.get(p.status) ?? 0) + 1);
    return m;
  }, [projects]);

  const columns = useMemo(() => {
    const codeOf = (stage: string) => stage.slice(0, 1);
    const cols = STAGES.map((name) => ({
      code: codeOf(name),
      name,
      label: name.slice(1),
      items: visible
        .filter((p) => p.stage === name)
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || stageIndex(a.stage ?? "") - stageIndex(b.stage ?? "")),
    }));
    const unclassified = visible
      .filter((p) => !p.stage)
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
    if (unclassified.length > 0) cols.push({ code: "-", name: "미분류", label: "미분류", items: unclassified });
    return cols;
  }, [visible]);

  // 리스트 뷰 전용 검색·필터·정렬 — 칸반 뷰(columns/visible)는 그대로 두고
  // 표 화면에만 적용한다(참고 이미지의 상단 필터바, 2026-09-12). workType은
  // 자유 입력 필드라 고정 옵션 대신 실제 등록된 값에서 뽑는다.
  const [listSearch, setListSearch] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState("");
  const [listStageFilter, setListStageFilter] = useState("");
  const [listWorkTypeFilter, setListWorkTypeFilter] = useState("");
  const [listAssigneeFilter, setListAssigneeFilter] = useState("");
  const [listSort, setListSort] = useState<"latest" | "oldest">("latest");

  const listWorkTypeOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.workType).filter((w): w is string => !!w))).sort(),
    [projects]
  );
  const listAssigneeOptions = useMemo(
    () => Array.from(new Set(projects.flatMap((p) => p.assignees))).sort(),
    [projects]
  );

  const listVisible = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    const rows = visible.filter((p) => {
      if (q && !`${p.title} ${p.orgName ?? ""} ${p.assignees.join(" ")}`.toLowerCase().includes(q)) return false;
      if (listStatusFilter && p.status !== listStatusFilter) return false;
      if (listStageFilter && p.stage !== listStageFilter) return false;
      if (listWorkTypeFilter && p.workType !== listWorkTypeFilter) return false;
      if (listAssigneeFilter && !p.assignees.includes(listAssigneeFilter)) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const favDiff = Number(b.isFavorite) - Number(a.isFavorite);
      if (favDiff !== 0) return favDiff;
      return listSort === "latest" ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt);
    });
  }, [visible, listSearch, listStatusFilter, listStageFilter, listWorkTypeFilter, listAssigneeFilter, listSort]);

  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    draggingIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  // 드롭 없이 드래그가 취소돼도(예: Esc, 보드 바깥에 놓음) 다음 드래그에 이전
  // id가 남아있지 않도록 항상 정리한다.
  function handleDragEnd() {
    draggingIdRef.current = null;
    setDragOverStage(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, stage: string) {
    e.preventDefault();
    setDragOverStage(null);
    const id = draggingIdRef.current;
    draggingIdRef.current = null;
    if (!id) return;
    startTransition(() => {
      void moveBusinessProjectV2Stage(id, stage === "미분류" ? null : stage);
    });
  }

  if (editingProject) {
    return (
      <div className="industry-theme board-page-content" style={{ padding: "var(--space-8)", maxWidth: 1400, margin: 0, background: "#ffffff", minHeight: "100vh" }}>
        <ProjectDetail project={editingProject} members={members} quotations={quotations} onClose={() => setEditingId(null)} />
      </div>
    );
  }

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <TopSettingsBar
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        view={view}
        onViewChange={setView}
      />
      <div className="board-page-content" style={{ padding: "var(--space-8)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>Business</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        전략기획팀에서 진행중인 SI 비지니스를 관리 합니다.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--space-6)",
          paddingBottom: "var(--space-4)",
          borderBottom: "1px solid var(--color-divider)",
          marginBottom: "var(--space-6)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 600, color: "var(--color-accent-800)" }}>
            {projects.length}
          </span>
          <span className="text-muted" style={{ fontSize: 13, marginLeft: 6 }}>
            전체
          </span>
        </div>
        <div style={{ width: 1, height: 20, background: "var(--color-divider)" }} />
        {STATUSES.map((s) => (
          <div key={s}>
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 20,
                fontWeight: 600,
                color: s === "진행 중" ? "var(--color-accent-700)" : undefined,
              }}
            >
              {counts.get(s) ?? 0}
            </span>
            <span className="text-muted" style={{ fontSize: 13, marginLeft: 6 }}>
              {s}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
          background: "#ffffff",
          border: "1px solid var(--color-divider)",
          borderRadius: 8,
          boxShadow: "var(--shadow-sm)",
          padding: "var(--space-4)",
        }}
      >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
          />
          완료·보류 포함
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div className="seg board-view-toggle">
            <button type="button" className={`seg-opt${view === "kanban" ? " active" : ""}`} onClick={() => setView("kanban")} style={{ border: 0 }}>
              목록
            </button>
            <button type="button" className={`seg-opt${view === "list" ? " active" : ""}`} onClick={() => setView("list")} style={{ border: 0 }}>
              리스트
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setShowAddDialog(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            새 사업 추가
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <div
          className="kanban-grid"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
            columnGap: "var(--space-8)",
            rowGap: "var(--space-5)",
            alignItems: "start",
          }}
        >
          {columns.map((col) => (
            <div
              key={col.name}
              className={`col-drop${dragOverStage === col.name ? " drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(col.name);
              }}
              onDragLeave={() => setDragOverStage((cur) => (cur === col.name ? null : cur))}
              onDrop={(e) => handleDrop(e, col.name)}
              style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minHeight: 80 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingBottom: "var(--space-2)",
                  borderBottom: "2px solid var(--color-accent-700)",
                  marginBottom: "var(--space-3)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14, flex: 1 }}>
                  <NavIcon
                    name={STAGE_ICONS[col.label] ?? "tag"}
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--color-accent-700)" }}
                  />
                  {col.label}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {col.items.length}
                </span>
              </div>
              {col.items.map((p) => (
                <KanbanCard
                  key={p.id}
                  project={p}
                  onOpen={() => setEditingId(p.id)}
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  onDragEnd={handleDragEnd}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
              {col.items.length === 0 && (
                <div
                  className="text-muted"
                  style={{
                    fontSize: 12,
                    padding: "var(--space-4) 0",
                    textAlign: "center",
                    border: "1px dashed var(--color-divider)",
                    borderRadius: 8,
                  }}
                >
                  없음
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="list-view-wrap" style={{ display: "flex", flexDirection: "column" }}>
        <div className="list-filter-bar">
          <div className="list-filter-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="사업명·기관·담당자 검색"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
          </div>
          <select className="list-filter-select" value={listStatusFilter} onChange={(e) => setListStatusFilter(e.target.value)}>
            <option value="">전체 상태</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="list-filter-select" value={listStageFilter} onChange={(e) => setListStageFilter(e.target.value)}>
            <option value="">전체 단계</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="list-filter-select" value={listWorkTypeFilter} onChange={(e) => setListWorkTypeFilter(e.target.value)}>
            <option value="">전체 사업방식</option>
            {listWorkTypeOptions.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
          <select className="list-filter-select" value={listAssigneeFilter} onChange={(e) => setListAssigneeFilter(e.target.value)}>
            <option value="">전체 담당자</option>
            {listAssigneeOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            className="list-filter-select list-filter-sort"
            value={listSort}
            onChange={(e) => setListSort(e.target.value as "latest" | "oldest")}
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table list-table">
            <thead>
              <tr>
                <th>사업명</th>
                <th>발주기관</th>
                <th>상태</th>
                <th>단계</th>
                <th>제출일</th>
                <th>담당자</th>
              </tr>
            </thead>
            <tbody>
              {listVisible.map((p) => (
                <tr key={p.id} onClick={() => setEditingId(p.id)} style={{ cursor: "pointer", background: p.isFavorite ? "var(--color-accent-100)" : undefined }}>
                  <td className="list-cell-title" style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(p.id);
                        }}
                        title={p.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        className="btn btn-ghost btn-icon"
                        style={{ color: p.isFavorite ? "#e3a51b" : undefined, fontSize: 14, padding: 0, minHeight: "auto", flex: "none" }}
                      >
                        {p.isFavorite ? "★" : "☆"}
                      </button>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-700)" strokeWidth="1.5" style={{ flex: "none" }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="detail-link">{p.title}</span>
                    </span>
                  </td>
                  <td data-label="발주기관">{p.orgName ?? "-"}</td>
                  <td data-label="상태">
                    <StatusTag status={p.status} />
                  </td>
                  <td data-label="단계">{p.stage ?? "미분류"}</td>
                  <td data-label="제출일">{formatDate(p.submissionDate) ?? "-"}</td>
                  <td data-label="담당자">{p.assignees.join(", ") || "-"}</td>
                </tr>
              ))}
              {listVisible.length === 0 && (
                <tr className="list-empty-row">
                  <td colSpan={6} style={{ textAlign: "center", padding: "var(--space-6)" }} className="text-muted">
                    조건에 맞는 사업이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
      </div>

      {showAddDialog && <AddProjectDialog members={members} onClose={() => setShowAddDialog(false)} />}
      </div>
    </div>
  );
}
