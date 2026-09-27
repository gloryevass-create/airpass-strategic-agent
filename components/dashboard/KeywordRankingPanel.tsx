"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { KeywordRanking, RankedKeyword } from "@/lib/queries/blogRankings";

// 네이버블로그 키워드별 검색순위(2026-09-27) — 키워드를 고르면 그 키워드의 검색 상위
// 10위를 그대로 보여준다. 기존 SOV 차트가 "우리가 잡힌 키워드의 평균"만 보여줘서
// "왜 우리가 안 보이는지"를 알 수 없던 것을 메운다.
//
// 키워드 선택은 URL(?keywordId=)에 남긴다 — 조회 조건이라 뒤로가기가 동작해야 하고,
// 링크로 공유도 된다(AdAccountStatsPanel의 statsFrom/statsTo와 같은 관용구).

const BASE_PATH = "/dashboard/blog";

function rankBadge(keyword: RankedKeyword): { text: string; tone: "good" | "none" } {
  if (keyword.bestTrackedRank == null) return { text: "미노출", tone: "none" };
  return { text: `${keyword.bestTrackedRank}위`, tone: "good" };
}

function KeywordPicker({
  keywords,
  selectedId,
  onSelect,
  pending,
}: {
  keywords: RankedKeyword[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = keywords.find((k) => k.keywordId === selectedId) ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? keywords.filter((k) => k.keyword.toLowerCase().includes(q)) : keywords;
  }, [keywords, search]);

  // 트리거 버튼 위치에 패널을 띄우고, 스크롤/리사이즈/바깥 클릭에 맞춰 정리한다
  // (QuotationBoard의 "연결 사업" 피커와 같은 방식 — 카드 overflow에 잘리지 않게 portal).
  useEffect(() => {
    if (!open) return;
    const reposition = () => setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    reposition();
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen((v) => !v)}
        disabled={pending || keywords.length === 0}
        style={{ maxWidth: "100%" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.keyword : `키워드 선택 (${keywords.length}개)`}
        </span>
        <span aria-hidden style={{ opacity: 0.5 }}>▾</span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: rect.bottom + 4,
              left: Math.min(rect.left, window.innerWidth - 300),
              width: 288,
              maxHeight: 320,
              overflowY: "auto",
              background: "#ffffff",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-sm)",
              zIndex: 50,
            }}
          >
            <div style={{ position: "sticky", top: 0, background: "#ffffff", padding: 6, borderBottom: "1px solid var(--color-divider)" }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="키워드 검색"
                className="input"
                style={{ minHeight: 28, fontSize: 12 }}
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-muted" style={{ margin: 0, padding: "var(--space-3)", fontSize: 12 }}>
                검색 결과가 없습니다.
              </p>
            ) : (
              filtered.map((k) => {
                const badge = rankBadge(k);
                return (
                  <button
                    key={k.keywordId}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setSearch("");
                      onSelect(k.keywordId);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      width: "100%",
                      padding: "6px 10px",
                      border: 0,
                      background: k.keywordId === selectedId ? "color-mix(in srgb, var(--color-accent) 12%, #ffffff)" : "transparent",
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 13,
                      textAlign: "left",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.keyword}</span>
                    <span
                      className={badge.tone === "good" ? "tag tag-accent" : "tag tag-neutral"}
                      style={{ flex: "0 0 auto", fontSize: 11 }}
                    >
                      {badge.text}
                    </span>
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </>
  );
}

export function KeywordRankingPanel({
  keywords,
  ranking,
  date,
}: {
  keywords: RankedKeyword[];
  ranking: KeywordRanking | null;
  date: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function selectKeyword(id: string) {
    startTransition(() => router.push(`${BASE_PATH}?keywordId=${encodeURIComponent(id)}`));
  }

  if (!date || keywords.length === 0) {
    return (
      <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
        아직 수집된 검색순위가 없습니다. 다음 수집(매일 아침)부터 이 목록이 채워집니다.
      </p>
    );
  }

  const selected = keywords.find((k) => k.keywordId === ranking?.keywordId) ?? null;
  const exposedCount = keywords.filter((k) => k.bestTrackedRank != null).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <KeywordPicker keywords={keywords} selectedId={ranking?.keywordId ?? null} onSelect={selectKeyword} pending={pending} />
        <span className="text-muted" style={{ fontSize: 12 }}>
          {date} 기준 · 검색 {keywords.length}개 중 <strong>{exposedCount}개</strong>에서 노출
          {pending && " · 불러오는 중..."}
        </span>
      </div>

      {selected && (
        <p style={{ margin: 0, fontSize: 13 }}>
          {selected.bestTrackedRank != null ? (
            <>
              <strong>{selected.bestTrackedName}</strong>가 <strong>{selected.bestTrackedRank}위</strong>
              {selected.trackedCount > 1 && ` (상위 10위 안에 우리·경쟁사 글 ${selected.trackedCount}건)`}
            </>
          ) : (
            <span className="text-muted">이 키워드의 상위 10위 안에 우리도 경쟁사도 없습니다.</span>
          )}
        </p>
      )}

      {ranking && (
        <table className="table mobile-card-table">
          <thead>
            <tr>
              <th style={{ width: 52 }}>순위</th>
              <th>블로그</th>
              <th>글 제목</th>
              <th style={{ width: 104 }}>발행일</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((row) => (
              <tr
                key={row.rank}
                style={row.trackedName ? { background: "color-mix(in srgb, var(--color-accent) 8%, transparent)" } : undefined}
              >
                <td data-label="순위" style={{ fontVariantNumeric: "tabular-nums", fontWeight: row.trackedName ? 700 : 400 }}>
                  {row.rank}위
                </td>
                <td className="list-cell-title" style={{ fontWeight: row.trackedName ? 700 : 400 }}>
                  {row.displayName}
                  {row.trackedName && (
                    <span className="tag tag-accent" style={{ marginLeft: 6, fontSize: 10 }}>
                      추적
                    </span>
                  )}
                </td>
                <td data-label="글 제목" style={{ whiteSpace: "normal" }}>
                  {row.postUrl ? (
                    <a href={row.postUrl} target="_blank" rel="noopener noreferrer" className="detail-link">
                      {row.postTitle ?? row.postUrl}
                    </a>
                  ) : (
                    (row.postTitle ?? "-")
                  )}
                </td>
                <td data-label="발행일" className="text-muted">
                  {row.postDate ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-muted" style={{ margin: 0, fontSize: 11 }}>
        * 네이버 블로그 검색 상위 10개를 그대로 보여줍니다 — 우리가 추적하지 않는 블로그(티스토리 등)도
        포함합니다. 위 SOV 차트의 백분율은 이 10개가 아니라 <strong>네이버 블로그만</strong>을 분모로
        계산한 값이라 숫자가 다를 수 있습니다. 검색 순위는 보는 사람·기기·시간에 따라 달라집니다.
      </p>
    </div>
  );
}
