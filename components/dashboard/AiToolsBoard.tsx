"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AiTool } from "@/lib/queries/aiTools";
import { createAiTool, updateAiTool, deleteAiTool } from "@/app/dashboard/actions/aiTools";
import { AiHubTabs } from "@/components/dashboard/AiHubTabs";
import { SearchInput } from "@/components/dashboard/SearchInput";
import { normalizeSearch } from "@/lib/normalizeSearch";

// Work Journal과 같은 방식(목록 위에 인라인 카드로 등록/수정 폼이 펼쳐지는 구조)의
// Industry 테마 화면 — AI 관련 링크를 팀원 누구나 등록해 공유한다(2026-09-06,
// AI HUB 그룹 신설과 함께 추가).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function ToolForm({ tool, onDone }: { tool: AiTool | null; onDone: (saved: boolean) => void }) {
  const action = tool ? updateAiTool.bind(null, tool.id) : createAiTool;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) onDone(true);
    wasPendingRef.current = pending;
  }, [pending, state, onDone]);

  return (
    <div className="card blueprint elev-md" style={{ marginBottom: "var(--space-4)", padding: "var(--space-5) var(--space-6)", background: "#ffffff" }}>
      <div className="card-kicker">{tool ? "링크 수정" : "새 링크 등록"}</div>
      <form action={formAction} style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div className="field">
          <label>제목 *</label>
          <input className="input" name="title" required maxLength={200} defaultValue={tool?.title ?? ""} placeholder="예: Claude Code" />
        </div>
        <div className="field">
          <label>링크 *</label>
          <input className="input" name="url" required defaultValue={tool?.url ?? ""} placeholder="https://..." />
        </div>
        <div className="field">
          <label>설명</label>
          <textarea className="input" name="description" rows={2} defaultValue={tool?.description ?? ""} placeholder="어떤 도구인지 간단히 설명해주세요" />
        </div>
        {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button type="submit" className="btn btn-primary blueprint" disabled={pending}>
            {pending ? "저장 중..." : tool ? "수정 저장" : "등록"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onDone(false)}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}

function ToolCard({ tool, currentUserId, onEdit }: { tool: AiTool; currentUserId: string; onEdit: () => void }) {
  const [, startTransition] = useTransition();
  const isOwn = tool.authorId === currentUserId;

  function handleDelete() {
    if (!window.confirm("이 링크를 삭제하시겠습니까?")) return;
    startTransition(() => {
      void deleteAiTool(tool.id);
    });
  }

  return (
    <div className="card blueprint elev-sm" style={{ padding: "var(--space-5)", background: "#ffffff" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <a
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 16, color: "var(--color-accent-700)" }}
        >
          {tool.title}
        </a>
        {isOwn && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", minHeight: "auto" }} onClick={onEdit}>
              수정
            </button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", minHeight: "auto" }} onClick={handleDelete}>
              삭제
            </button>
          </div>
        )}
      </div>
      <p className="text-muted" style={{ fontSize: 12, margin: "4px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {tool.url}
      </p>
      {tool.description && (
        <p style={{ fontSize: 13, margin: "var(--space-2) 0 0", whiteSpace: "pre-wrap" }}>{tool.description}</p>
      )}
      <p className="text-muted" style={{ fontSize: 11, margin: "var(--space-3) 0 0" }}>
        {tool.authorDisplay} · {formatDate(tool.createdAt)}
      </p>
    </div>
  );
}

export function AiToolsBoard({ tools, currentUserId }: { tools: AiTool[]; currentUserId: string }) {
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const editingTool = editingId && editingId !== "new" ? (tools.find((t) => t.id === editingId) ?? null) : null;

  // 알림벨/푸시 알림에서 "?open=id"로 들어오면 목록만 보여주지 말고 그 도구의
  // 수정 폼을 바로 연다(2026-09-16, 사용자 요청 — app/dashboard/actions/
  // aiTools.ts가 알림 링크에 이 쿼리를 실어 보낸다). 연 뒤에는 쿼리를 지워서
  // 새로고침해도 같은 폼이 다시 안 뜨게 한다.
  const router = useRouter();
  const searchParams = useSearchParams();
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    if (tools.some((t) => t.id === openId)) setEditingId(openId);
    router.replace("/dashboard/ai-tools");
  }, [searchParams, tools, router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [search, setSearch] = useState("");
  const filteredTools = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (!q) return tools;
    return tools.filter(
      (t) =>
        normalizeSearch(t.title).includes(q) ||
        normalizeSearch(t.description ?? "").includes(q) ||
        normalizeSearch(t.url).includes(q)
    );
  }, [tools, search]);

  return (
    <div className="industry-theme" style={{ background: "#ffffff", minHeight: "100vh" }}>
      <AiHubTabs />
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1100, margin: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>AI Tools</h1>
          </div>
          <button type="button" className="btn btn-primary blueprint" onClick={() => setEditingId("new")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            새 링크 등록
          </button>
        </div>
        <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
          팀에서 쓰는 AI 도구·서비스 링크를 함께 모읍니다.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
          <SearchInput value={search} onChange={setSearch} placeholder="제목·설명·링크로 검색" style={{ maxWidth: "none", marginBottom: 0 }} />
        </div>

        {editingId === "new" && <ToolForm tool={null} onDone={() => setEditingId(null)} />}
        {editingTool && <ToolForm tool={editingTool} onDone={() => setEditingId(null)} />}

        {filteredTools.length === 0 ? (
          <div className="card blueprint" style={{ padding: "var(--space-8)", textAlign: "center" }}>
            <p className="text-muted" style={{ margin: 0 }}>
              {tools.length === 0 ? "아직 등록된 링크가 없습니다." : "검색 결과가 없습니다."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--space-4)" }}>
            {filteredTools.map((t) => (
              <ToolCard key={t.id} tool={t} currentUserId={currentUserId} onEdit={() => setEditingId(t.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
