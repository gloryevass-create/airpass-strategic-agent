"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Todo, TodoPriority } from "@/lib/queries/todos";
import { createTodo, updateTodo, deleteTodo, toggleTodoComplete } from "@/app/dashboard/actions/todos";
import { usePushSubscription } from "@/lib/hooks/usePushSubscription";
import { NavIcon } from "@/components/icons/NavIcon";

const PRIORITY_LABEL: Record<TodoPriority, string> = { high: "높음", medium: "보통", low: "낮음" };
const PRIORITY_COLOR: Record<TodoPriority, string> = {
  high: "var(--color-accent-700)",
  medium: "var(--color-accent-500, var(--color-accent))",
  low: "var(--color-ink-mute, #8a94a6)",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

function formatDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NotificationSetupBanner() {
  const { status, enable } = usePushSubscription();

  if (status === "granted" || status === "unsupported") return null;

  return (
    <div
      className="card blueprint"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "var(--space-4) var(--space-5)",
        marginBottom: "var(--space-4)",
        background: "#fff",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        {status === "denied"
          ? "브라우저 알림 권한이 꺼져 있어 할 일 알람을 받을 수 없습니다. 브라우저 설정에서 알림을 허용해주세요."
          : "할 일 알람을 브라우저 알림으로 받으려면 알림 권한을 허용해주세요."}
      </p>
      {status !== "denied" && (
        <button type="button" className="btn btn-primary blueprint" onClick={enable} disabled={status === "loading"}>
          {status === "loading" ? "설정 중..." : "알림 허용"}
        </button>
      )}
    </div>
  );
}

function TodoForm({ todo, onDone }: { todo: Todo | null; onDone: (saved: boolean) => void }) {
  const action = todo ? updateTodo.bind(null, todo.id) : createTodo;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) onDone(true);
    wasPendingRef.current = pending;
  }, [pending, state, onDone]);

  return (
    <div className="card blueprint elev-md" style={{ marginBottom: "var(--space-4)", padding: "var(--space-5) var(--space-6)", background: "#ffffff", borderRadius: "var(--radius-lg)" }}>
      <div className="card-kicker">{todo ? "할 일 수정" : "새 할 일 등록"}</div>
      <form action={formAction} style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div className="field">
          <label>제목 *</label>
          <input className="input" name="title" required maxLength={200} defaultValue={todo?.title ?? ""} placeholder="예: 산출내역 발송" />
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label>기한</label>
            <input className="input" type="date" name="dueDate" defaultValue={todo?.dueDate ?? ""} />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label>우선순위</label>
            <select className="input" name="priority" defaultValue={todo?.priority ?? "medium"}>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>알람 (선택)</label>
          {/* step=300(5분)으로 지정해 브라우저 네이티브 datetime-local 피커의
              분 선택 단위를 5분으로 맞춘다(2026-09-13, 1분 단위 스크롤이 번거롭다는
              피드백) — 값 자체는 여전히 자유롭게 타이핑 입력 가능, 휠/화살표
              조작만 5분 단위로 움직인다. */}
          <input
            className="input"
            type="datetime-local"
            name="alarmAt"
            step={300}
            defaultValue={formatDateTimeLocal(todo?.alarmAt ?? null)}
          />
        </div>
        {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button type="submit" className="btn btn-primary blueprint" disabled={pending}>
            {pending ? "저장 중..." : todo ? "수정 저장" : "등록"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onDone(false)}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}

function TodoRow({ todo, onToggle, onEdit }: { todo: Todo; onToggle: () => void; onEdit: () => void }) {
  const [, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("이 할 일을 삭제하시겠습니까?")) return;
    startTransition(() => {
      void deleteTodo(todo.id);
    });
  }

  const isOverdue = !todo.isCompleted && todo.dueDate && new Date(todo.dueDate) < new Date(new Date().toDateString());

  return (
    <div
      className="card blueprint elev-sm"
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-5)",
        background: "#ffffff",
        opacity: todo.isCompleted ? 0.6 : 1,
        borderRadius: "var(--radius-lg)",
      }}
    >
      <input type="checkbox" checked={todo.isCompleted} onChange={onToggle} style={{ width: 16, height: 16, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 400,
            fontSize: 13,
            textDecoration: todo.isCompleted ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {todo.title}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: PRIORITY_COLOR[todo.priority], flexShrink: 0 }}>{PRIORITY_LABEL[todo.priority]}</span>
        {todo.alarmAt && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        )}
        <span className="text-muted" style={{ fontSize: 12, flexShrink: 0, color: isOverdue ? "var(--color-accent-900)" : undefined }}>
          {todo.dueDate ? formatDate(todo.dueDate) : "기한 없음"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="수정"
          title="수정"
          style={{ width: 26, height: 26, padding: 0, minHeight: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={onEdit}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="삭제"
          title="삭제"
          style={{ width: 26, height: 26, padding: 0, minHeight: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={handleDelete}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type TodoFilter = "all" | "today" | "pending" | "done" | "high";

const FILTERS: { key: TodoFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "today", label: "오늘" },
  { key: "pending", label: "미완료" },
  { key: "done", label: "완료" },
  { key: "high", label: "높은 우선순위" },
];

function isToday(dueDate: string): boolean {
  return new Date(dueDate).toDateString() === new Date().toDateString();
}

export function TodoBoard({ todos }: { todos: Todo[] }) {
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [filter, setFilter] = useState<TodoFilter>("all");
  const [, startTransition] = useTransition();
  // 체크박스 완료 처리 낙관적 업데이트(2026-09-13) — SI Business 등 즐겨찾기와
  // 동일한 패턴. 서버 액션(revalidatePath 포함) 왕복을 기다리지 않고 클릭 즉시
  // 화면에 반영하고, 서버 데이터가 다시 내려오면 자연히 합쳐진다 — 체크박스가
  // 느리게 반응한다는 피드백(2026-09-13)으로 도입.
  const [completedOverrides, setCompletedOverrides] = useState<Map<string, boolean>>(new Map());

  const todosWithOverrides = useMemo(
    () => todos.map((t) => (completedOverrides.has(t.id) ? { ...t, isCompleted: completedOverrides.get(t.id)! } : t)),
    [todos, completedOverrides]
  );

  function handleToggleComplete(id: string) {
    const current = todosWithOverrides.find((t) => t.id === id)?.isCompleted ?? false;
    setCompletedOverrides((prev) => new Map(prev).set(id, !current));
    startTransition(async () => {
      await toggleTodoComplete(id, !current);
    });
  }

  const editingTodo =
    editingId && editingId !== "new" ? (todosWithOverrides.find((t) => t.id === editingId) ?? null) : null;

  const filteredTodos = useMemo(() => {
    switch (filter) {
      case "today":
        return todosWithOverrides.filter((t) => t.dueDate && isToday(t.dueDate));
      case "pending":
        return todosWithOverrides.filter((t) => !t.isCompleted);
      case "done":
        return todosWithOverrides.filter((t) => t.isCompleted);
      case "high":
        return todosWithOverrides.filter((t) => t.priority === "high");
      default:
        return todosWithOverrides;
    }
  }, [todosWithOverrides, filter]);

  return (
    <div className="industry-theme" style={{ background: "#ffffff", minHeight: "100vh" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1100, margin: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <NavIcon name="checkSquare" width={22} height={22} stroke="var(--color-accent)" strokeWidth={1.5} />
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>To-Do</h1>
          </div>
          <button type="button" className="btn btn-primary blueprint" onClick={() => setEditingId("new")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            새 할 일 등록
          </button>
        </div>
        <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
          나만 보는 개인 할 일 목록입니다. 기한·우선순위를 정하고, 필요하면 알람을 설정하세요.
        </p>

        <NotificationSetupBanner />

        {editingId === "new" && <TodoForm todo={null} onDone={() => setEditingId(null)} />}
        {editingTodo && <TodoForm todo={editingTodo} onDone={() => setEditingId(null)} />}

        <div className="seg" style={{ marginBottom: "var(--space-4)" }}>
          {FILTERS.map((f) => (
            <div
              key={f.key}
              className={`seg-opt ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </div>
          ))}
        </div>

        {filteredTodos.length === 0 ? (
          <div className="card blueprint" style={{ padding: "var(--space-8)", textAlign: "center", borderRadius: "var(--radius-lg)" }}>
            <p className="text-muted" style={{ margin: 0 }}>조건에 맞는 할 일이 없습니다.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {filteredTodos.map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={() => handleToggleComplete(t.id)} onEdit={() => setEditingId(t.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
