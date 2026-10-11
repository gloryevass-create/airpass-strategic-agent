"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BusinessCard, BusinessCardGroupCount, BusinessCardSort } from "@/lib/queries/businessCards";
import { UNGROUPED } from "@/lib/queries/businessCards";
import { parseBusinessCardCsv, IMPORT_CHUNK_SIZE, type BusinessCardInput } from "@/lib/businessCardCsv";
import { importBusinessCards, deleteBusinessCard, deleteAllBusinessCards } from "@/app/dashboard/actions/businessCards";

/* ─────────────────────────── 한 줄(명함) ─────────────────────────── */

/** 리멤버 웹과 같은 배치: 이름 아래 회사, 직함 아래 부서, 휴대폰 아래 유선전화,
 * 그리고 이메일. 보조 정보는 회색으로 한 단계 낮춰 보여준다. */
function CardRow({ card, onDelete, busy }: { card: BusinessCard; onDelete: () => void; busy: boolean }) {
  const sub = { fontSize: 13, color: "var(--color-neutral-600)" } as const;
  return (
    <div
      className="bc-row"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px,1.1fr) minmax(120px,1fr) minmax(130px,0.9fr) minmax(170px,1.2fr) 48px",
        gap: "var(--space-4)",
        alignItems: "start",
        padding: "var(--space-4) var(--space-2)",
        borderBottom: "1px solid var(--color-divider)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="bc-name" style={{ fontWeight: 600, fontSize: 15 }}>{card.name}</div>
        {card.company && <div style={sub}>{card.company}</div>}
      </div>
      <div style={{ minWidth: 0 }}>
        {card.title && <div style={{ fontSize: 14 }}>{card.title}</div>}
        {card.department && <div style={sub}>{card.department}</div>}
      </div>
      <div style={{ minWidth: 0 }}>
        {card.mobile && <div style={{ fontSize: 14 }}>{card.mobile}</div>}
        {card.workPhone && <div style={sub}>{card.workPhone}</div>}
      </div>
      <div style={{ minWidth: 0, wordBreak: "break-all" }}>
        {card.email && <div style={{ fontSize: 14 }}>{card.email}</div>}
        {card.address && <div style={sub}>{card.address}</div>}
      </div>
      <div className="bc-actions" style={{ textAlign: "right" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "2px 6px", minHeight: "auto" }}
          disabled={busy}
          onClick={onDelete}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── 페이지 번호 ─────────────────────────── */

/** 리멤버처럼 번호를 묶어 보여준다(‹ 1 2 … 10 ›). 좁은 화면에서는 한 줄에
 * 담기지 않아 5개로 줄인다 — 버튼을 더 좁히면 손가락으로 누르기 어려워진다.
 *
 * 서버 렌더 때는 window를 볼 수 없으므로 일단 데스크톱(10개)으로 그리고
 * 마운트 후에 바꾼다(처음부터 window를 읽으면 hydration 불일치가 난다). */
function Pagination({ page, pageCount, onGo }: { page: number; pageCount: number; onGo: (p: number) => void }) {
  const [perBlock, setPerBlock] = useState(10);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPerBlock(mq.matches ? 5 : 10);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (pageCount <= 1) return null;
  const block = Math.floor((page - 1) / perBlock);
  const start = block * perBlock + 1;
  const end = Math.min(pageCount, start + perBlock - 1);
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const btn = (active: boolean) =>
    ({
      minWidth: 34,
      height: 34,
      padding: "0 8px",
      border: active ? "1px solid var(--color-accent)" : "1px solid transparent",
      background: active ? "var(--color-accent-100)" : "none",
      color: active ? "var(--color-accent-800)" : "inherit",
      fontWeight: active ? 600 : 400,
      cursor: "pointer",
      font: "inherit",
      fontSize: 14,
    }) as const;

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, padding: "var(--space-5) 0", flexWrap: "wrap" }}>
      <button type="button" className="bc-page-btn" style={btn(false)} disabled={page <= 1} onClick={() => onGo(page - 1)} aria-label="이전 페이지">
        ‹
      </button>
      {nums.map((n) => (
        <button key={n} type="button" className="bc-page-btn" style={btn(n === page)} onClick={() => onGo(n)} aria-current={n === page ? "page" : undefined}>
          {n}
        </button>
      ))}
      <button type="button" className="bc-page-btn" style={btn(false)} disabled={page >= pageCount} onClick={() => onGo(page + 1)} aria-label="다음 페이지">
        ›
      </button>
    </div>
  );
}

/* ─────────────────────────── 본체 ─────────────────────────── */

export function BusinessCardBoard({
  cards,
  matched,
  total,
  groups,
  ungrouped,
  page,
  pageCount,
  search,
  group,
  sort,
}: {
  cards: BusinessCard[];
  matched: number;
  total: number;
  groups: BusinessCardGroupCount[];
  ungrouped: number;
  page: number;
  pageCount: number;
  search: string;
  group: string;
  sort: BusinessCardSort;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(search);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = pending || uploading;

  function go(next: { q?: string; group?: string; page?: number; sort?: BusinessCardSort }) {
    const sp = new URLSearchParams();
    const q = next.q ?? term;
    const g = next.group ?? group;
    const s = next.sort ?? sort;
    // 검색어·그룹·정렬을 바꾸면 1페이지로 돌아간다 — 3페이지를 보던 중 조건을
    // 바꾸면 결과가 적어 빈 페이지가 뜰 수 있기 때문.
    const p = next.page ?? 1;
    if (q.trim()) sp.set("q", q.trim());
    if (g) sp.set("group", g);
    if (s !== "registered") sp.set("sort", s);
    if (p > 1) sp.set("page", String(p));
    startTransition(() => router.push(`/dashboard/account/business-cards${sp.toString() ? `?${sp}` : ""}`));
  }

  /** CSV는 브라우저에서 파싱해 해석된 행만 300건씩 보낸다 — 파일을 그대로
   * 보내면 Server Action 4MB·Vercel 4.5MB 상한에 걸리고, 형식 오류도 서버까지
   * 갔다 와야 알 수 있다. */
  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setMessage(null);
    const { cards: parsed, mergedInFile, error: parseError } = parseBusinessCardCsv(await file.text());
    if (parseError) return setError(parseError);
    if (parsed.length === 0) return setError("저장할 명함이 없습니다(이름이 있는 행을 찾지 못했습니다).");

    setUploading(true);
    setProgress({ done: 0, total: parsed.length });
    let saved = 0;
    try {
      for (let i = 0; i < parsed.length; i += IMPORT_CHUNK_SIZE) {
        const chunk: BusinessCardInput[] = parsed.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await importBusinessCards(chunk);
        if ("error" in res) return setError(`${res.error} (${saved}건까지 저장됨)`);
        saved += res.saved;
        setProgress({ done: saved, total: parsed.length });
      }
      setMessage(
        `${saved}건을 저장했습니다.` +
          (mergedInFile > 0 ? ` 파일 안에서 같은 사람(이름·회사·휴대폰 동일) ${mergedInFile}건은 하나로 합쳤습니다.` : "")
      );
      router.refresh();
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDeleteAll() {
    if (!window.confirm(`내 명함첩 ${total}건을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    if (!window.confirm("정말 삭제합니다. 다시 올리려면 CSV가 필요합니다.")) return;
    startTransition(async () => {
      const { deleted } = await deleteAllBusinessCards();
      setMessage(`${deleted}건을 삭제했습니다.`);
      router.refresh();
    });
  }

  /** 등록일 순일 때만 리멤버처럼 날짜 머리글로 묶는다. */
  const sections = useMemo(() => {
    if (sort !== "registered") return [{ date: null as string | null, items: cards }];
    const out: { date: string | null; items: BusinessCard[] }[] = [];
    for (const c of cards) {
      const d = c.registeredOn;
      const last = out[out.length - 1];
      if (last && last.date === d) last.items.push(c);
      else out.push({ date: d, items: [c] });
    }
    return out;
  }, [cards, sort]);

  const currentLabel =
    group === UNGROUPED ? "미분류 명함" : group ? group : search ? "검색 결과" : "전체 명함";

  const railItem = (label: string, value: string, count: number) => {
    const active = group === value;
    return (
      <button
        key={value || "all"}
        type="button"
        onClick={() => go({ group: value })}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          border: 0,
          background: active ? "var(--color-accent-100)" : "none",
          color: active ? "var(--color-accent-800)" : "inherit",
          fontWeight: active ? 600 : 400,
          font: "inherit",
          fontSize: 14,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span className="text-muted" style={{ fontSize: 12, flex: "none" }}>{count}</span>
      </button>
    );
  };

  return (
    <>
      {/* ── 검색 ── */}
      <div style={{ marginBottom: "var(--space-5)" }}>
        <input
          className="input"
          style={{ width: "100%", height: 44, fontSize: 15 }}
          placeholder="이름, 회사명 등으로 명함을 검색하세요"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go({ q: e.currentTarget.value });
          }}
        />
      </div>

      <div className="two-col-section" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: "var(--space-5)", alignItems: "start" }}>
        {/* ── 왼쪽: 그룹 ── */}
        <div className="card blueprint" style={{ background: "#ffffff", padding: "var(--space-3)" }}>
          <div className="card-kicker bc-rail-kicker" style={{ padding: "0 10px var(--space-2)" }}>명함첩</div>
          {/* 좁은 화면에서는 이 묶음이 가로 스크롤 칩 한 줄이 된다(industryTheme.css). */}
          <div className="bc-rail-groups">
            {railItem("전체 명함", "", total)}
            {groups.map((g) => railItem(g.name, g.name, g.count))}
            {ungrouped > 0 && railItem("미분류 명함", UNGROUPED, ungrouped)}
          </div>

          <div style={{ borderTop: "1px solid var(--color-divider)", margin: "var(--space-3) 0 var(--space-2)" }} />
          <button type="button" className="btn btn-secondary blueprint" style={{ width: "100%" }} onClick={() => setShowUpload((v) => !v)}>
            명함 등록하기
          </button>
        </div>

        {/* ── 오른쪽: 목록 ── */}
        <div>
          {showUpload && (
            <div className="card blueprint" style={{ background: "#ffffff", padding: "var(--space-5)", marginBottom: "var(--space-4)" }}>
              <div className="card-kicker">명함첩 CSV 올리기</div>
              <p className="text-muted" style={{ fontSize: 12, margin: "var(--space-2) 0 var(--space-3)" }}>
                리멤버 앱 → 명함첩 → 내보내기로 받은 CSV를 그대로 올리세요. 같은 사람(이름·회사·휴대폰이 같은 명함)은
                덮어쓰므로 갱신된 파일을 다시 올려도 건수가 불어나지 않습니다.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                  className="input"
                  style={{ maxWidth: 340 }}
                />
                {total > 0 && (
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={handleDeleteAll}>
                    전체 삭제
                  </button>
                )}
              </div>
              {progress && (
                <p className="text-muted" style={{ fontSize: 13, margin: "var(--space-2) 0 0" }}>
                  저장 중... ({progress.done}/{progress.total})
                </p>
              )}
              {message && <p style={{ fontSize: 13, margin: "var(--space-2) 0 0", color: "var(--color-accent-700)" }}>{message}</p>}
              {error && <p style={{ fontSize: 13, margin: "var(--space-2) 0 0", color: "var(--color-accent-900)" }}>{error}</p>}
            </div>
          )}

          <div className="card blueprint" style={{ background: "#ffffff", padding: "var(--space-5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>
                {currentLabel} ({matched.toLocaleString()})
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                {(search || group) && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setTerm("");
                      startTransition(() => router.push("/dashboard/account/business-cards"));
                    }}
                  >
                    초기화
                  </button>
                )}
                <select
                  className="input"
                  style={{ width: 130 }}
                  value={sort}
                  onChange={(e) => go({ sort: e.target.value as BusinessCardSort })}
                >
                  <option value="registered">등록일 순</option>
                  <option value="name">이름 순</option>
                </select>
              </div>
            </div>

            {cards.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13, margin: 0, padding: "var(--space-6) 0", textAlign: "center" }}>
                {total === 0 ? "아직 올린 명함이 없습니다. 왼쪽 '명함 등록하기'에서 CSV를 올려주세요." : "검색 결과가 없습니다."}
              </p>
            ) : (
              sections.map((sec, i) => (
                <div key={sec.date ?? `s${i}`}>
                  {sort === "registered" && (
                    <div style={{ fontWeight: 600, fontSize: 14, padding: "var(--space-4) var(--space-2) var(--space-2)" }}>
                      {sec.date ?? "등록일 없음"}
                    </div>
                  )}
                  {sec.items.map((c) => (
                    <CardRow
                      key={c.id}
                      card={c}
                      busy={busy}
                      onDelete={() => {
                        if (!window.confirm(`"${c.name}" 명함을 삭제할까요?`)) return;
                        startTransition(async () => {
                          await deleteBusinessCard(c.id);
                          router.refresh();
                        });
                      }}
                    />
                  ))}
                </div>
              ))
            )}

            <Pagination page={page} pageCount={pageCount} onGo={(p) => go({ page: p })} />
          </div>
        </div>
      </div>
    </>
  );
}
