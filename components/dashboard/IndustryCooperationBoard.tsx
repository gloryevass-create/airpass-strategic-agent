"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NavIcon, type IconName } from "@/components/icons/NavIcon";
import type { CooperationProject, CooperationProjectHistoryEntry } from "@/lib/queries/cooperationProjects";
import {
  createCooperationProject,
  updateCooperationProject,
  deleteCooperationProject,
  moveCooperationProjectRelation,
  toggleCooperationProjectFavorite,
  createCooperationProjectComment,
  deleteCooperationProjectComment,
  createCooperationProjectHistoryEntry,
  updateCooperationProjectHistoryEntry,
} from "@/app/dashboard/actions/cooperationProjects";

// Business(/dashboard/business)를 Claude Design "Industry" 테마로 다시 그린 것과
// 같은 틀을 재사용한다 — 데이터·서버 액션은 기존 Cooperation 그대로, 화면만
// 새로 그렸다(사용자 확인, 2026-08-29).
// "콘텐츠"와 "하드웨어"는 하나로 합쳤다(사용자 확인, 2026-08-31 — 실제로는 두
// 유형이 명확히 갈리지 않아 항목을 나눠 관리할 실익이 없었음). 기존에 이 두
// 값으로 저장된 협업 건은 마이그레이션으로 "콘텐츠/하드웨어"로 통합했다.
const RELATION_TYPES = ["콘텐츠/하드웨어", "공동생산 판매", "제품 판매", "자재구매", "일반", "비즈니스협업"];
const WORK_TYPES = ["아이디어", "시장조사", "기획", "개발", "상품화", "제품생산", "조달등록", "자료", "판매", "첫 미팅"];
const STATUSES = ["시작 전", "진행 중", "완료", "종료"];
const TERMINAL_STATUSES = new Set(["완료", "종료"]);

// 칸반 그룹 헤더의 첫 글자 코드 대신 아이콘으로 표시(2026-09-12, 사용자 확인).
const RELATION_ICONS: Record<string, IconName> = {
  "콘텐츠/하드웨어": "pie",
  "공동생산 판매": "share",
  "제품 판매": "tag",
  자재구매: "wallet",
  일반: "list",
  비즈니스협업: "link",
  미분류: "menu",
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

function ManagerChips({
  name,
  label,
  members,
  defaultValue,
}: {
  name: string;
  label: string;
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

const DEFAULTS_STORAGE_KEY = "cooperation-board:defaults";
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

/* ─────────────────────────── 새 협업 추가 다이얼로그 ─────────────────────────── */

function AddProjectDialog({ members, onClose }: { members: string[]; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createCooperationProject, undefined);
  const wasPendingRef = useRef(false);

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
          새 협업 추가
        </div>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div className="field">
            <label>이름 *</label>
            <input className="input" name="title" required />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div className="field">
              <label>업체</label>
              <input className="input" name="company" />
            </div>
            <div className="field">
              <label>관계</label>
              <select className="input" name="relationType" defaultValue="">
                <option value="">미분류</option>
                {RELATION_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>업무</label>
              <select className="input" name="workType" defaultValue="">
                <option value="">없음</option>
                {WORK_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {w}
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
              <label>프로젝트 시작일</label>
              <input className="input" type="date" name="projectStartDate" />
            </div>
            <div className="field">
              <label>프로젝트 종료일</label>
              <input className="input" type="date" name="projectEndDate" />
            </div>
          </div>
          <ManagerChips name="mainAssignees" label="메인담당" members={members} defaultValue={[]} />
          <ManagerChips name="subAssignees" label="서브담당" members={members} defaultValue={[]} />
          <div className="field">
            <label>내용</label>
            <textarea className="input" name="content" rows={3} />
          </div>
          <div className="field">
            <label>AI 키워드 요약</label>
            <textarea className="input" name="aiKeywords" rows={3} />
          </div>
          {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "저장 중..." : "협업 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────── 히스토리 ─────────────────────────── */

function HistoryRow({ entry }: { entry: CooperationProjectHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const action = updateCooperationProjectHistoryEntry.bind(null, entry.id);
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

function HistorySection({ project }: { project: CooperationProject }) {
  const action = createCooperationProjectHistoryEntry.bind(null, project.id);
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
        <textarea className="input" name="content" required rows={3} placeholder="예: 담당자와 통화, 견적 재요청" />
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

function CommentsSection({ project }: { project: CooperationProject }) {
  const action = createCooperationProjectComment.bind(null, project.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [, startTransition] = useTransition();

  function handleDelete(commentId: string) {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    startTransition(() => {
      void deleteCooperationProjectComment(commentId);
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
  onClose,
}: {
  project: CooperationProject;
  members: string[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateCooperationProject, undefined);
  const wasPendingRef = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) onClose();
    wasPendingRef.current = pending;
  }, [pending, state, onClose]);

  function handleDelete() {
    if (!window.confirm("이 협업 항목을 삭제할까요?")) return;
    startTransition(() => {
      void deleteCooperationProject(project.id);
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
          <label>이름 *</label>
          <input className="input" name="title" defaultValue={project.title} required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <div className="field">
            <label>업체</label>
            <input className="input" name="company" defaultValue={project.company ?? ""} />
          </div>
          <div className="field">
            <label>관계</label>
            <select className="input" name="relationType" defaultValue={project.relationType ?? ""}>
              <option value="">미분류</option>
              {RELATION_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>업무</label>
            <select className="input" name="workType" defaultValue={project.workType ?? ""}>
              <option value="">없음</option>
              {WORK_TYPES.map((w) => (
                <option key={w} value={w}>
                  {w}
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
            <label>프로젝트 시작일</label>
            <input className="input" type="date" name="projectStartDate" defaultValue={toDateInputValue(project.projectStartDate)} />
          </div>
          <div className="field">
            <label>프로젝트 종료일</label>
            <input className="input" type="date" name="projectEndDate" defaultValue={toDateInputValue(project.projectEndDate)} />
          </div>
        </div>
        <ManagerChips name="mainAssignees" label="메인담당" members={members} defaultValue={project.mainAssignees} />
        <ManagerChips name="subAssignees" label="서브담당" members={members} defaultValue={project.subAssignees} />
        <div className="field">
          <label>내용</label>
          <textarea className="input" name="content" defaultValue={project.content ?? ""} rows={3} />
        </div>
        <div className="field">
          <label>AI 키워드 요약</label>
          <textarea className="input" name="aiKeywords" defaultValue={project.aiKeywords ?? ""} rows={3} />
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
        이 협업 삭제
      </button>

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
  project: CooperationProject;
  onOpen: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onToggleFavorite: (id: string) => void;
}) {
  const [, startTransition] = useTransition();

  function handleRelationChange(relationType: string) {
    startTransition(() => {
      void moveCooperationProjectRelation(project.id, relationType || null);
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
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span onClick={onOpen} style={{ cursor: "pointer" }} className="detail-link">
          {project.title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <StatusTag status={project.status} />
        {project.company && (
          <span className="text-muted" style={{ fontSize: 11 }}>
            {project.company}
          </span>
        )}
      </div>
      <select
        className="input"
        value={project.relationType ?? ""}
        onChange={(e) => handleRelationChange(e.target.value)}
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
        {RELATION_TYPES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ─────────────────────────── 메인 보드 ─────────────────────────── */

export function IndustryCooperationBoard({ projects, members }: { projects: CooperationProject[]; members: string[] }) {
  const [showArchived, setShowArchived] = useState(HARD_DEFAULTS.showArchived);
  const [view, setView] = useState<"kanban" | "list">(HARD_DEFAULTS.view);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 알림벨/푸시 알림에서 "?open=id"로 들어오면 목록만 보여주지 말고 그 협업의
  // 상세 팝업을 바로 연다(2026-09-16, 사용자 요청 — app/dashboard/actions/
  // cooperationProjects.ts가 알림 링크에 이 쿼리를 실어 보낸다). 연 뒤에는
  // 쿼리를 지워서 새로고침해도 같은 팝업이 다시 안 뜨게 한다.
  const router = useRouter();
  const searchParams = useSearchParams();
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    if (projects.some((p) => p.id === openId)) setEditingId(openId);
    router.replace("/dashboard/cooperation");
  }, [searchParams, projects, router]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [dragOverRelation, setDragOverRelation] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  // SI Business 즐겨찾기와 동일한 낙관적 업데이트 패턴(2026-09-12).
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
      await toggleCooperationProjectFavorite(id);
    });
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadSavedDefaults();
    if (saved) {
      setShowArchived(saved.showArchived);
      setView(saved.view);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 모바일에서 view를 "list"로 강제하던 코드는 두 보기 모두 모바일에서 쓰고
  // 싶다는 요청(2026-09-14)으로 제거했다 — SI Business와 동일하게 칸반은
  // CSS(.kanban-grid)로 1열로 쌓이고, 리스트는 카드형으로 바뀐다.

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
    const codeOf = (name: string) => name.slice(0, 1);
    const byFavorite = (a: CooperationProject, b: CooperationProject) => Number(b.isFavorite) - Number(a.isFavorite);
    const cols = RELATION_TYPES.map((name) => ({
      code: codeOf(name),
      name,
      label: name,
      items: visible.filter((p) => p.relationType === name).sort(byFavorite),
    }));
    const unclassified = visible.filter((p) => !p.relationType).sort(byFavorite);
    if (unclassified.length > 0) cols.push({ code: "-", name: "미분류", label: "미분류", items: unclassified });
    return cols;
  }, [visible]);

  // 리스트 뷰 전용 검색·필터·정렬 — 칸반 뷰(columns/visible)는 그대로 두고
  // 표 화면에만 적용한다(참고 이미지의 상단 필터바, 2026-09-12).
  const [listSearch, setListSearch] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState("");
  const [listRelationFilter, setListRelationFilter] = useState("");
  const [listWorkTypeFilter, setListWorkTypeFilter] = useState("");
  const [listAssigneeFilter, setListAssigneeFilter] = useState("");
  const [listSort, setListSort] = useState<"latest" | "oldest">("latest");

  const listAssigneeOptions = useMemo(
    () => Array.from(new Set(projects.flatMap((p) => [...p.mainAssignees, ...p.subAssignees]))).sort(),
    [projects]
  );

  const listVisible = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    const rows = visible.filter((p) => {
      if (
        q &&
        !`${p.title} ${p.company ?? ""} ${p.mainAssignees.join(" ")} ${p.subAssignees.join(" ")}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (listStatusFilter && p.status !== listStatusFilter) return false;
      if (listRelationFilter && p.relationType !== listRelationFilter) return false;
      if (listWorkTypeFilter && p.workType !== listWorkTypeFilter) return false;
      if (listAssigneeFilter && !p.mainAssignees.includes(listAssigneeFilter) && !p.subAssignees.includes(listAssigneeFilter))
        return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const favDiff = Number(b.isFavorite) - Number(a.isFavorite);
      if (favDiff !== 0) return favDiff;
      return listSort === "latest" ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt);
    });
  }, [visible, listSearch, listStatusFilter, listRelationFilter, listWorkTypeFilter, listAssigneeFilter, listSort]);

  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    draggingIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    draggingIdRef.current = null;
    setDragOverRelation(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, relation: string) {
    e.preventDefault();
    setDragOverRelation(null);
    const id = draggingIdRef.current;
    draggingIdRef.current = null;
    if (!id) return;
    startTransition(() => {
      void moveCooperationProjectRelation(id, relation === "미분류" ? null : relation);
    });
  }

  if (editingProject) {
    return (
      <div className="industry-theme board-page-content" style={{ background: "#ffffff", padding: "var(--space-8)", maxWidth: 1400, margin: 0 }}>
        <ProjectDetail project={editingProject} members={members} onClose={() => setEditingId(null)} />
      </div>
    );
  }

  return (
    <div className="industry-theme" style={{ background: "#ffffff", minHeight: "100vh" }}>
      <TopSettingsBar showArchived={showArchived} onShowArchivedChange={setShowArchived} view={view} onViewChange={setView} />
      <div className="board-page-content" style={{ padding: "var(--space-8)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>Cooperation</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        협업중인 회사와의 비지니스를 관리 합니다.
      </p>

      <div
        className="stats-strip"
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
          완료·종료 포함
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
            새 협업 추가
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <div
          className="kanban-grid"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
            columnGap: "var(--space-6)",
            rowGap: "var(--space-5)",
            alignItems: "start",
            overflowX: "auto",
          }}
        >
          {columns.map((col) => (
            <div
              key={col.name}
              className={`col-drop${dragOverRelation === col.name ? " drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverRelation(col.name);
              }}
              onDragLeave={() => setDragOverRelation((cur) => (cur === col.name ? null : cur))}
              onDrop={(e) => handleDrop(e, col.name)}
              style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minHeight: 80, minWidth: 160 }}
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
                    name={RELATION_ICONS[col.label] ?? "menu"}
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
              placeholder="이름·업체·담당자 검색"
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
          <select className="list-filter-select" value={listRelationFilter} onChange={(e) => setListRelationFilter(e.target.value)}>
            <option value="">전체 관계</option>
            {RELATION_TYPES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select className="list-filter-select" value={listWorkTypeFilter} onChange={(e) => setListWorkTypeFilter(e.target.value)}>
            <option value="">전체 사업방식</option>
            {WORK_TYPES.map((w) => (
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
                <th>이름</th>
                <th>업체</th>
                <th>상태</th>
                <th>관계</th>
                <th>시작일</th>
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
                      <span className="detail-link">{p.title}</span>
                    </span>
                  </td>
                  <td data-label="업체">{p.company ?? "-"}</td>
                  <td data-label="상태">
                    <StatusTag status={p.status} />
                  </td>
                  <td data-label="관계">{p.relationType ?? "미분류"}</td>
                  <td data-label="시작일">{formatDate(p.projectStartDate) ?? "-"}</td>
                  <td data-label="담당자">{[...p.mainAssignees, ...p.subAssignees].join(", ") || "-"}</td>
                </tr>
              ))}
              {listVisible.length === 0 && (
                <tr className="list-empty-row">
                  <td colSpan={6} style={{ textAlign: "center", padding: "var(--space-6)" }} className="text-muted">
                    조건에 맞는 협업이 없습니다.
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
