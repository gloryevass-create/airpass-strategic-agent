"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, Reorder, useDragControls } from "framer-motion";
import type { Quotation, QuotationItem } from "@/lib/queries/quotations";
import type { ProductCatalogItem } from "@/lib/queries/productCatalog";
import { createQuotation, updateQuotation, deleteQuotation } from "@/app/dashboard/actions/quotations";
import { QUOTATION_SUPPLIER } from "@/lib/quotationCompany";
import { SearchInput } from "@/components/dashboard/SearchInput";

function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function formatCurrency(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// 목록의 "인쇄" 버튼은 로그인 필요한 내부용 /dashboard/quotations/[id]/print(대시보드
// 레이아웃 안이라 헤더·사이드바가 같이 뜬다) 대신, 고객 공유용 공개 페이지
// /quote/[id](app/quote/[id], 대시보드 레이아웃 바깥이라 문서만 뜬다)를 진짜 팝업
// 창으로 띄운다 — "팝업으로 견적서만 나오게 해달라"는 요청(2026-09-08)에 맞춰
// 헤더/사이드바 없이 문서만 보이게 하려면 이 경로가 필요했다. window.open의
// 세 번째 인자에 width/height 등 창 속성을 하나라도 주면 새 탭이 아니라 별도
// 팝업 창으로 뜬다.
function openQuotationPopup(id: string) {
  window.open(`/quote/${id}`, "quotationPreview", "popup,width=880,height=1000,scrollbars=yes,resizable=yes,noopener,noreferrer");
}

function emptyItem(): QuotationItem {
  return {
    id: crypto.randomUUID(),
    productId: null,
    name: "",
    specification: "",
    unit: "EA",
    quantity: 1,
    unitPrice: 0,
    amount: 0,
    note: "",
  };
}

// 표 안의 입력칸은 일반 .input보다 더 조밀하게(패딩·글자 축소) — 좁은 열 안에
// 여러 칸이 들어가야 하는 산출품목 표라서 그렇다.
const CELL_INPUT_STYLE: CSSProperties = { minHeight: "auto", padding: "3px 6px", fontSize: 12 };
// 드래그·품목 추가/삭제 시 framer-motion이 각 행을 부드럽게 슬라이드시킬 수 있도록
// <table>이 아니라 CSS 그리드로 "표처럼 보이는" 레이아웃을 구성한다 — 실제 <tr>은
// display:table-row라 transform 애니메이션이 브라우저에 따라 제대로 안 먹는다.
const ITEM_GRID_COLS = "32px 40px minmax(160px,1.4fr) minmax(140px,1fr) 64px 56px 108px 108px minmax(96px,1fr) 40px";
// product_catalog.procurement_fee_rate는 퍼센트가 아니라 분수(0.0054 = 0.54%)로
// 저장된다(app/dashboard/actions/productCatalog.ts의 자동 감지 로직과 동일한
// 표현 — 앞서 퍼센트로 착각해 100으로 한 번 더 나눠 수수료가 100배 작게 계산됐던
// 버그를 사용자가 신고해 수정함, 2026-08-28). rate가 비어 있는(0 이하) 조달
// 품목에 적용하는 기본값 — 서버(app/dashboard/actions/quotations.ts)와 같아야 한다.
const DEFAULT_PROCUREMENT_FEE_RATE = 0.0054;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ width: 96, flex: "none", borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 500 }} className="text-muted">
        {label}
      </div>
      <div style={{ flex: 1, padding: "6px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#4b5563" }}>{value}</div>
    </div>
  );
}

function InfoSplitRow({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
}) {
  return (
    <div style={{ display: "flex", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ width: 96, flex: "none", borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 500 }} className="text-muted">
        {leftLabel}
      </div>
      <div style={{ flex: 1, borderRight: "1px solid var(--color-divider)", padding: "6px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#4b5563" }}>
        {leftValue}
      </div>
      <div style={{ width: 96, flex: "none", borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 500 }} className="text-muted">
        {rightLabel}
      </div>
      <div style={{ flex: 1, padding: "6px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#4b5563" }}>{rightValue}</div>
    </div>
  );
}

/** 산출정보 박스 안에서 SI Business(business_projects_v2) 프로젝트를 검색해
 * 산출내역과 연결한다 — 연결해두면 그 프로젝트 상세 화면에서도 이 산출내역을 볼 수
 * 있다(사용자 확인, 2026-08-27). */
function BusinessProjectField({
  projects,
  value,
  onChange,
}: {
  projects: { id: string; title: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = projects.find((p) => p.id === value) ?? null;

  // 산출정보 박스와 그 바깥 카드가 둘 다 overflow-hidden(모서리를 둥글게 자르는
  // 용도)이라, 드롭다운을 이 박스 안에 그대로 두면 박스 경계에서 잘려 보이지
  // 않는다(사용자 확인, 2026-08-28). 물품 검색처럼 표 위에 완전히 떠 보이도록
  // document.body에 포털로 그려서 그 어떤 조상의 overflow에도 잘리지 않게 한다.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: globalThis.MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleReposition(e: Event) {
      // 패널 자체를 스크롤할 때도 capture 단계라 window의 scroll 리스너가 걸린다 —
      // 목록 내부 스크롤까지 닫아버리면 스크롤이 안 되는 것처럼 보이므로, 패널
      // 내부에서 난 스크롤은 무시하고 바깥(페이지) 스크롤일 때만 닫는다.
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, search]);

  function openPanel() {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(true);
  }

  return (
    <div style={{ display: "flex", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ width: 96, flex: "none", borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 500 }} className="text-muted">
        연결 사업
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 6, padding: "6px 12px" }}>
        <button ref={triggerRef} type="button" onClick={openPanel} className="btn btn-secondary" style={{ minWidth: 0, flex: 1, fontSize: 11, minHeight: 26, padding: "2px 10px" }}>
          <SearchIcon size={12} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected ? selected.title : `사업 검색 (${projects.length}개)`}
          </span>
        </button>
        {selected && (
          <button type="button" onClick={() => onChange(null)} aria-label="연결 해제" className="btn btn-ghost" style={{ flex: "none", padding: "2px 6px" }}>
            ✕
          </button>
        )}
      </div>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              zIndex: 50,
              maxHeight: 256,
              overflowY: "auto",
              border: "1px solid var(--color-divider)",
              background: "#ffffff",
              textAlign: "left",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--color-divider)", background: "#ffffff", padding: "var(--space-2) var(--space-3)" }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="사업명으로 검색"
                className="input"
                style={{ minWidth: 0, flex: 1, minHeight: 28, fontSize: 12 }}
              />
              <button type="button" onClick={() => setOpen(false)} className="btn btn-primary" style={{ flex: "none", fontSize: 11, minHeight: 28, padding: "0 10px" }}>
                선택 완료
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="text-muted" style={{ padding: "var(--space-4) var(--space-3)", textAlign: "center", fontSize: 12 }}>
                검색 결과가 없습니다.
              </p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setSearch("");
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 8,
                    borderTop: "1px solid var(--color-divider)",
                    borderLeft: 0,
                    borderRight: 0,
                    borderBottom: 0,
                    padding: "var(--space-2) var(--space-3)",
                    textAlign: "left",
                    background: p.id === value ? "var(--color-accent-100)" : "transparent",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700 }}>{p.title}</span>
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

/** 방금 검색해서 추가한 품목이라 아직 아무것도 손대지 않은 "빈 직접입력 행"이면
 * 그 자리를 대신 채우고, 그렇지 않으면 새 행으로 덧붙인다 — 검색으로 여러 개를
 * 연속 선택할 때마다 매번 빈 행이 하나씩 남는 것을 막는다. */
function isBlankItem(item: QuotationItem): boolean {
  return !item.productId && !item.name && item.unitPrice === 0;
}

function itemFromProduct(p: ProductCatalogItem): QuotationItem {
  const unitPrice = p.unitPrice ?? 0;
  // 제품 카탈로그의 "비고"에서 자동 인식된 조달채널·조달번호(detectProcurement(),
  // app/dashboard/actions/productCatalog.ts)가 있으면 품목 선택 시 이 비고란에도
  // 그대로 옮겨 적는다 — 예전엔 productId만 연결되고 조달정보는 어디에도 안
  // 보였는데, 인쇄본까지 그대로 나가는 이 비고 칸에 채워서 산출내역에서도
  // 바로 확인할 수 있게 한다(사용자 확인, 2026-09-07).
  const note = p.procurementChannel && p.procurementNumber ? `${p.procurementChannel} : ${p.procurementNumber}` : "";
  return {
    id: crypto.randomUUID(),
    productId: p.id,
    name: p.name,
    specification: p.specification ?? "",
    unit: "EA",
    quantity: 1,
    unitPrice,
    amount: unitPrice,
    note,
  };
}

/** 드래그 핸들(⠿)에서 포인터를 누를 때만 드래그가 시작되도록
 * dragListener={false} + useDragControls를 쓴다 — 그래야 행 안의 입력칸을
 * 클릭·드래그해서 텍스트를 선택하는 동작과 충돌하지 않는다. framer-motion의
 * Reorder는 네이티브 HTML5 드래그(품목 순서 변경에서 이전에 쓰던 방식)와 달리
 * 포인터 위치를 그대로 따라가며 다른 행들을 스프링 애니메이션으로 밀어내
 * "버벅거리지 않고 자연스럽게" 움직인다(사용자 확인, 2026-08-27). */
function ItemRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: QuotationItem;
  index: number;
  onUpdate: (patch: Partial<QuotationItem>) => void;
  onRemove: () => void;
}) {
  const dragControls = useDragControls();
  const cellStyle: CSSProperties = { borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "6px 8px" };

  return (
    <Reorder.Item
      value={item}
      id={item.id}
      as="div"
      dragListener={false}
      dragControls={dragControls}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      whileDrag={{ boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 10 }}
      style={{ position: "relative", display: "grid", gridTemplateColumns: ITEM_GRID_COLS, touchAction: "none", background: "#ffffff", fontSize: 13 }}
    >
      <div style={{ ...cellStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span
          onPointerDown={(e) => dragControls.start(e)}
          className="text-muted"
          style={{ display: "inline-block", cursor: "grab", touchAction: "none", userSelect: "none" }}
          aria-label="드래그해서 순서 변경"
        >
          ⠿
        </span>
      </div>
      <div style={{ ...cellStyle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }} className="text-muted">
        {index + 1}
      </div>
      <div style={cellStyle}>
        <input value={item.name} onChange={(e) => onUpdate({ name: e.target.value })} className="input" style={CELL_INPUT_STYLE} />
      </div>
      <div style={cellStyle}>
        <input value={item.specification} onChange={(e) => onUpdate({ specification: e.target.value })} className="input" style={CELL_INPUT_STYLE} />
      </div>
      <div style={cellStyle}>
        <input
          type="number"
          min={0}
          value={item.quantity}
          onChange={(e) => onUpdate({ quantity: Number(e.target.value) || 0 })}
          className="input"
          style={{ ...CELL_INPUT_STYLE, textAlign: "right" }}
        />
      </div>
      <div style={cellStyle}>
        <input value={item.unit} onChange={(e) => onUpdate({ unit: e.target.value })} className="input" style={{ ...CELL_INPUT_STYLE, textAlign: "center" }} />
      </div>
      <div style={cellStyle}>
        <input
          type="number"
          min={0}
          value={item.unitPrice}
          onChange={(e) => onUpdate({ unitPrice: Number(e.target.value) || 0 })}
          className="input"
          style={{ ...CELL_INPUT_STYLE, textAlign: "right" }}
        />
      </div>
      <div style={{ ...cellStyle, display: "flex", alignItems: "center", justifyContent: "flex-end", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700 }}>
        {formatCurrency(item.amount)}
      </div>
      <div style={cellStyle}>
        <input value={item.note} onChange={(e) => onUpdate({ note: e.target.value })} className="input" style={CELL_INPUT_STYLE} />
      </div>
      <div style={{ ...cellStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <button
          type="button"
          onClick={onRemove}
          aria-label="품목 삭제"
          style={{ background: "none", border: 0, padding: 0, color: "var(--color-accent-900)", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </Reorder.Item>
  );
}

function ItemsEditor({
  items,
  products,
  onChange,
}: {
  items: QuotationItem[];
  products: ProductCatalogItem[];
  onChange: (items: QuotationItem[]) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const favoriteCount = products.filter((p) => p.isFavorite).length;
  const filteredProducts = useMemo(() => {
    let list = favoritesOnly ? products.filter((p) => p.isFavorite) : products;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.specification ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, search, favoritesOnly]);

  function update(index: number, patch: Partial<QuotationItem>) {
    const next = items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    next[index] = { ...next[index], amount: Math.round(next[index].quantity * next[index].unitPrice) };
    onChange(next);
  }

  function addProduct(p: ProductCatalogItem) {
    const blankIndex = items.findIndex(isBlankItem);
    const newItem = itemFromProduct(p);
    if (blankIndex !== -1) {
      onChange(items.map((it, i) => (i === blankIndex ? newItem : it)));
    } else {
      onChange([...items, newItem]);
    }
    setJustAddedId(p.id);
    window.setTimeout(() => setJustAddedId((cur) => (cur === p.id ? null : cur)), 1200);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div ref={panelRef} style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span className="tag tag-neutral">{items.length}개 품목</span>
        <button
          type="button"
          onClick={() => {
            setFavoritesOnly(false);
            setSearchOpen(true);
          }}
          className="btn btn-secondary"
          style={{ fontSize: 12 }}
        >
          <SearchIcon />
          물품 검색 ({products.length}개)
        </button>
        <button
          type="button"
          onClick={() => {
            setFavoritesOnly(true);
            setSearchOpen(true);
          }}
          className="btn btn-secondary"
          style={{ fontSize: 12 }}
        >
          ★ 즐겨찾기 ({favoriteCount}개)
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => onChange([...items, emptyItem()])} className="btn btn-ghost" style={{ fontSize: 12 }}>
          + 행 추가
        </button>

        {searchOpen && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "100%",
              zIndex: 20,
              marginTop: 8,
              maxHeight: 288,
              width: "100%",
              overflowY: "auto",
              border: "1px solid var(--color-divider)",
              background: "#ffffff",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--color-divider)", background: "#ffffff", padding: "var(--space-2) var(--space-3)" }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="물품명·규격으로 검색"
                className="input"
                style={{ minWidth: 0, flex: 1, minHeight: 28, fontSize: 12 }}
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="btn btn-primary" style={{ flex: "none", fontSize: 11, minHeight: 28, padding: "0 10px" }}>
                선택 완료
              </button>
            </div>
            {filteredProducts.length === 0 ? (
              <p className="text-muted" style={{ padding: "var(--space-4) var(--space-3)", textAlign: "center", fontSize: 12 }}>
                검색 결과가 없습니다.
              </p>
            ) : (
              filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    borderTop: `1px solid ${justAddedId === p.id ? "var(--color-accent)" : "var(--color-divider)"}`,
                    borderLeft: 0,
                    borderRight: 0,
                    borderBottom: 0,
                    padding: "var(--space-2) var(--space-3)",
                    textAlign: "left",
                    background: "transparent",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700 }}>
                      {p.isFavorite && <span style={{ marginRight: 4, color: "var(--color-accent)" }}>★</span>}
                      {p.name}
                    </span>
                    {p.specification && (
                      <span className="text-muted" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>
                        {p.specification}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: "none", fontSize: 12, fontWeight: 700, color: "var(--color-accent-700)" }}>
                    {p.unitPrice != null ? `${formatCurrency(p.unitPrice)}원` : "-"}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ overflowX: "auto", borderLeft: "1px solid var(--color-divider)", borderTop: "1px solid var(--color-divider)" }}>
        <div style={{ minWidth: 880 }}>
          <div style={{ display: "grid", gridTemplateColumns: ITEM_GRID_COLS, background: "var(--color-surface)", fontSize: 11, fontWeight: 600 }} className="text-muted">
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px" }} />
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap" }}>No</div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap" }}>품명 *</div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap" }}>규격</div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap", textAlign: "right" }}>수량</div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap" }}>단위</div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap", textAlign: "right" }}>
              단가(VAT 포함)
            </div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap", textAlign: "right" }}>금액</div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px", whiteSpace: "nowrap" }}>비고</div>
            <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px" }} />
          </div>

          <Reorder.Group as="div" axis="y" values={items} onReorder={onChange}>
            <AnimatePresence initial={false}>
              {items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  onUpdate={(patch) => update(index, patch)}
                  onRemove={() => onChange(items.filter((_, i) => i !== index))}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>

          {items.length === 0 && (
            <p className="text-muted" style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "var(--space-6) var(--space-2)", textAlign: "center", fontSize: 12 }}>
              물품을 검색하거나 행을 추가해 산출내역을 작성해 주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function QuotationForm({
  quotation,
  members,
  products,
  businessProjects,
  onDone,
}: {
  quotation: Quotation | null;
  members: string[];
  products: ProductCatalogItem[];
  businessProjects: { id: string; title: string }[];
  onDone: () => void;
}) {
  const action = quotation ? updateQuotation : createQuotation;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [items, setItems] = useState<QuotationItem[]>(
    quotation && quotation.items.length > 0 ? quotation.items : [emptyItem()]
  );
  const [discountAmount, setDiscountAmount] = useState(quotation?.discountAmount ?? 0);
  const [extraAmount, setExtraAmount] = useState(quotation?.extraAmount ?? 0);
  const [includeStamp, setIncludeStamp] = useState(quotation?.includeStamp ?? true);
  const [executionType, setExecutionType] = useState(quotation?.executionType ?? "직영");
  const [consortiumRate, setConsortiumRate] = useState(quotation?.consortiumRate ?? 0);
  const [extraInternalCost, setExtraInternalCost] = useState(quotation?.extraInternalCost ?? 0);
  const [businessProjectId, setBusinessProjectId] = useState<string | null>(quotation?.businessProjectId ?? null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // 품목 단가는 부가세 포함가라 품목금액 합계가 곧 품목금액이고, 공급가액·부가세는
  // 그 금액을 1.1로 나눠 거꾸로 계산한다(서버의 computeTotals와 동일한 방식). 조달
  // 수수료(product_catalog.procurement_fee_rate)는 이 계산 밖에서 최종 합계에만
  // 더해진다 — WHIZZUP 레퍼런스의 "품목금액 → 조달수수료(별도) → 최종 합계" 구조.
  const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
  const adjustedAmount = Math.max(0, subtotal - discountAmount + extraAmount);
  const supply = Math.round(adjustedAmount / 1.1);
  const tax = adjustedAmount - supply;
  const procurementFeeAmount = items.reduce((sum, it) => {
    const product = it.productId ? productById.get(it.productId) : null;
    if (!product?.procurement) return sum;
    const rate = product.procurementFeeRate && product.procurementFeeRate > 0 ? product.procurementFeeRate : DEFAULT_PROCUREMENT_FEE_RATE;
    return sum + Math.round(it.amount * rate);
  }, 0);
  const total = adjustedAmount + procurementFeeAmount;

  // 내부용 수익 분석 — 제품 카탈로그에서 고른 품목만 수익률을 알 수 있어 계산에
  // 넣고, 직접 입력한 품목은 마진을 알 수 없으니 추측하지 않고 0으로 둔다.
  // 공급방식에 따라 우리 수익이 되는 컬럼이 다르다(product_catalog: 직공급은
  // margin_rate, 협력사는 commission_rate) — ProductCatalogTable.tsx가 목록·CSV·폼에서
  // 쓰는 것과 같은 분기다. 여기서는 마진율만 보고 있어서 협력사 공급 품목(예: 수수료
  // 25%짜리 VR기기)의 수익이 항상 0으로 계산되던 버그가 있었다(사용자 신고, 2026-09-08).
  // margin_rate/commission_rate는 procurement_fee_rate와 마찬가지로 DB에 이미 소수
  // 형태(0.6 = 60%)로 저장돼 있다(ProductCatalogTable.tsx::formatRate가 표시할 때만
  // *100 함) — 그런데 여기서 한 번 더 /100을 해서 마진이 100배 작게(0.6%가 아니라
  // 0.006%로) 계산되는 두 번째 버그가 있었다(사용자가 수치로 재확인, 2026-09-08).
  // 이 값들은 QuotationPrintView(인쇄용 화면)에는 애초에 전달하지 않아 밖으로
  // 나가는 문서에는 절대 노출되지 않는다(사용자 확인, 2026-08-27).
  const estimatedProfit = items.reduce((sum, it) => {
    if (!it.productId) return sum;
    const product = productById.get(it.productId);
    if (!product) return sum;
    const rate = (product.supplyType === "partner" ? product.commissionRate : product.marginRate) ?? 0;
    return sum + Math.round(it.amount * rate);
  }, 0);
  const consortiumPayment = executionType === "컨소" ? Math.round(estimatedProfit * (consortiumRate / 100)) : 0;
  const finalProfit = estimatedProfit - consortiumPayment - extraInternalCost;
  const marginPercent = supply > 0 ? (finalProfit / supply) * 100 : 0;

  // formAction(dispatch)을 직접 호출해도 서버 액션의 반환값(성공/에러)을 그
  // 자리에서 알 수 없다(useActionState는 다음 렌더에서만 state를 갱신) — 그런데도
  // 예전 코드는 매번 무조건 onDone()을 불러 폼을 닫아버렸고, 그 결과 저장이 실패해도
  // 에러 메시지 없이 그냥 목록으로 돌아가 "저장이 안 되는데 아무 반응도 없는"
  // 것처럼 보였다(사용자 확인, 2026-08-28). pending이 true→false로 바뀌는 순간
  // state에 에러가 없을 때만 닫아, 실패 시에는 폼에 남아 에러를 보여준다.
  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) {
      onDone();
    }
    wasPendingRef.current = pending;
  }, [pending, state, onDone]);

  return (
    <form
      action={(formData) => {
        formData.set("itemsJson", JSON.stringify(items));
        formAction(formData);
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", alignItems: "flex-start" }}
    >
      {quotation && <input type="hidden" name="id" value={quotation.id} />}

      <div style={{ minWidth: 0, flex: "3 1 480px", overflow: "hidden", border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff" }}>
      {/* 산출내역 상단 레터헤드 바 — 인쇄용 화면과 톤을 맞춰 미리보기처럼 보이게 한다
          (고정 색상 — Industry 테마 색과 무관하게 실제 인쇄 문서 배색을 그대로 유지). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#262b3a", padding: "var(--space-4) var(--space-6)" }}>
        <span style={{ width: 96, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)" }}>Quotation</span>
        <h2 style={{ margin: 0, textAlign: "center", fontSize: 18, fontWeight: 700, letterSpacing: "0.5em", color: "#ffffff" }}>산 출 내 역</h2>
        <span style={{ width: 96, textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
          {quotation ? quotation.quoteNumber : "저장 시 번호 발급"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-4)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: "var(--space-4)", alignItems: "stretch" }}>
          {/* 산출정보 */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--color-divider)" }}>
            <div style={{ borderBottom: "1px solid var(--color-divider)", padding: "6px 0", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.3em", color: "#4b5563" }}>
              산출정보
            </div>
            <div style={{ display: "flex" }}>
              <div style={{ width: 96, flex: "none", borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 500 }} className="text-muted">
                산출일자
              </div>
              <input
                name="quoteDate"
                type="date"
                defaultValue={quotation?.quoteDate ?? todayStr()}
                required
                style={{ flex: 1, border: 0, background: "transparent", padding: "6px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#4b5563", outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", borderTop: "1px solid var(--color-divider)" }}>
              <div style={{ width: 96, flex: "none", borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 500 }} className="text-muted">
                수신 기관명 *
              </div>
              <input
                name="customerName"
                defaultValue={quotation?.customerName ?? ""}
                required
                placeholder="기관명 또는 업체명"
                style={{ flex: 1, border: 0, background: "transparent", padding: "6px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#4b5563", outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", borderTop: "1px solid var(--color-divider)" }}>
              <div style={{ width: 96, flex: "none", borderRight: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "6px 8px", textAlign: "center", fontSize: 11, fontWeight: 500 }} className="text-muted">
                산출명
              </div>
              <input
                name="projectTitle"
                defaultValue={quotation?.projectTitle ?? ""}
                placeholder="예: 가상현실 스포츠실 구축"
                style={{ flex: 1, border: 0, background: "transparent", padding: "6px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#4b5563", outline: "none" }}
              />
            </div>
            <BusinessProjectField projects={businessProjects} value={businessProjectId} onChange={setBusinessProjectId} />
            <input type="hidden" name="businessProjectId" value={businessProjectId ?? ""} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", borderTop: "1px solid var(--color-divider)", background: "#ffffff", padding: "6px 12px" }}>
              <p className="text-muted" style={{ margin: 0, fontSize: 10 }}>산출금액 (VAT 포함)</p>
              <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "var(--color-accent-700)" }}>{formatCurrency(total)}원</p>
            </div>
          </div>

          {/* 공급자 (고정 정보) */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid var(--color-divider)" }}>
            <div style={{ position: "relative", borderBottom: "1px solid var(--color-divider)", padding: "6px 0", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.3em", color: "#4b5563" }}>
              공급자
              <label className="text-muted" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 400, letterSpacing: "normal" }}>
                <input type="checkbox" name="includeStamp" checked={includeStamp} onChange={(e) => setIncludeStamp(e.target.checked)} style={{ width: 12, height: 12 }} />
                직인 포함
              </label>
            </div>
            <div style={{ position: "relative" }}>
              <InfoRow label="상호" value={QUOTATION_SUPPLIER.name} />
              <InfoRow label="사업자번호" value={QUOTATION_SUPPLIER.businessNumber} />
              <InfoRow label="대표자" value={QUOTATION_SUPPLIER.representative} />
              <InfoRow label="주소" value={QUOTATION_SUPPLIER.address} />
              <InfoSplitRow
                leftLabel="전화번호"
                leftValue={QUOTATION_SUPPLIER.phone}
                rightLabel="팩스번호"
                rightValue={QUOTATION_SUPPLIER.fax}
              />
              <InfoSplitRow
                leftLabel="업태"
                leftValue={QUOTATION_SUPPLIER.businessType}
                rightLabel="종목"
                rightValue={QUOTATION_SUPPLIER.businessItems}
              />
              {includeStamp && (
                // eslint-disable-next-line @next/next/no-img-element -- 고정 크기 도장 이미지, next/image 최적화 불필요
                <img
                  src="/quotation-stamp.png"
                  alt="직인"
                  style={{ position: "absolute", right: 12, top: 40, height: 52, width: 52 }}
                />
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>산출 품목 {items.length}개</span>
          <span className="text-muted" style={{ fontSize: 12 }}>제품 카탈로그에서 선택하면 품명·규격·단가가 자동으로 채워집니다.</span>
        </div>
        <ItemsEditor items={items} products={products} onChange={setItems} />

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <div className="field">
              <label>할인 금액</label>
              <input
                name="discountAmount"
                type="number"
                min={0}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                className="input"
                style={{ width: 128 }}
              />
            </div>
            <div className="field">
              <label>추가 금액</label>
              <input
                name="extraAmount"
                type="number"
                min={0}
                value={extraAmount}
                onChange={(e) => setExtraAmount(Number(e.target.value) || 0)}
                className="input"
                style={{ width: 128 }}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", fontSize: 12, width: 256 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <span className="text-muted">품목금액 (VAT 포함)</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(adjustedAmount)}원</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <span className="text-muted">조달수수료 (별도)</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(procurementFeeAmount)}원</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <span className="text-muted">최종 합계</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatCurrency(total)}원</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-700)" }}>공급가액</span>
                <p className="text-muted" style={{ margin: "2px 0 0", fontSize: 10 }}>세액 참고 · 품목금액 기준</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-700)" }}>{formatCurrency(supply)}원</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-700)" }}>부가세</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-700)" }}>{formatCurrency(tax)}원</span>
            </div>
          </div>
        </div>

        <div className="field">
          <label>특기사항 / 메모</label>
          <textarea name="memo" defaultValue={quotation?.memo ?? ""} rows={3} className="input" />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <button type="button" onClick={onDone} className="btn btn-secondary">
            취소
          </button>
          {quotation && (
            <button type="button" onClick={() => openQuotationPopup(quotation.id)} className="btn btn-secondary">
              인쇄용 보기
            </button>
          )}
        </div>
      </div>
      </div>

      {/* 영업 정보 — WHIZZUP 레퍼런스의 SALES INFO 패널. 협업 구분·내부 수익 분석은
          이 폼(화면)에만 보이고 인쇄용 화면에는 애초에 전달되지 않는다. */}
      <div style={{ display: "flex", width: "100%", flexDirection: "column", gap: "var(--space-3)", border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)", flex: "0 0 288px" }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--color-accent)" }}>Sales Info</p>
          <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700 }}>영업 정보</p>
        </div>

        <div className="field">
          <label>담당자</label>
          <select name="managerName" defaultValue={quotation?.managerName ?? ""} className="input">
            <option value="">선택</option>
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>협업 구분</label>
          <select
            name="executionType"
            value={executionType}
            onChange={(e) => setExecutionType(e.target.value as typeof executionType)}
            className="input"
          >
            <option value="직영">직영</option>
            <option value="컨소">컨소</option>
            <option value="해당없음">해당없음</option>
          </select>
        </div>

        {executionType === "컨소" && (
          <>
            <div className="field">
              <label>컨소 업체명</label>
              <input name="consortiumCompany" defaultValue={quotation?.consortiumCompany ?? ""} className="input" />
            </div>
            <div className="field">
              <label>컨소 지급률(%)</label>
              <input
                name="consortiumRate"
                type="number"
                min={0}
                max={100}
                value={consortiumRate}
                onChange={(e) => setConsortiumRate(Number(e.target.value) || 0)}
                className="input"
              />
            </div>
          </>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--color-divider)", background: "#fff8ec", padding: "var(--space-3)", fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700 }}>수익 분석</span>
            <span style={{ borderRadius: 999, background: "#f0dfc0", padding: "1px 8px", fontSize: 10, fontWeight: 600, color: "#8a5a00" }}>내부용</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="text-muted">
            <span>예상 수익</span>
            <span style={{ color: "var(--color-text)" }}>{formatCurrency(estimatedProfit)}원</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="text-muted">
            <span>컨소 지급</span>
            <span style={{ color: "var(--color-text)" }}>{formatCurrency(consortiumPayment)}원</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }} className="text-muted">
            <span>추가 내부비용</span>
            <input
              name="extraInternalCost"
              type="number"
              min={0}
              value={extraInternalCost}
              onChange={(e) => setExtraInternalCost(Number(e.target.value) || 0)}
              className="input"
              style={{ width: 96, textAlign: "right", minHeight: "auto", padding: "2px 6px", fontSize: 12 }}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-divider)", paddingTop: 4, fontWeight: 700 }}>
            <span>최종 총이익</span>
            <span>{formatCurrency(finalProfit)}원</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="text-muted">
            <span>마진%</span>
            <span style={{ color: "var(--color-text)" }}>{marginPercent.toFixed(1)}%</span>
          </div>
          <p className="text-muted" style={{ margin: 0, fontSize: 10 }}>
            제품 카탈로그의 마진율(직공급)·수수료율(협력사)을 기준으로 계산되며(직접 입력한 품목은
            수익률을 몰라 0으로 처리), 인쇄·PDF 화면에는 표시되지 않습니다.
          </p>
        </div>

        {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 12 }}>{state.error}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="submit" name="status" value="draft" disabled={pending} className="btn btn-secondary">
            {pending ? "저장 중..." : "임시 저장"}
          </button>
          <button type="submit" name="status" value="final" disabled={pending} className="btn btn-primary">
            {pending ? "저장 중..." : "최종 저장"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function QuotationBoard({
  quotations,
  members,
  products,
  businessProjects,
}: {
  quotations: Quotation[];
  members: string[];
  products: ProductCatalogItem[];
  businessProjects: { id: string; title: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  // 알림벨/푸시 알림에서 "?open=id"로 들어오면 목록만 보여주지 말고 그
  // 산출내역의 상세 팝업을 바로 연다(2026-09-16, 사용자 요청 — app/dashboard/
  // actions/quotations.ts가 알림 링크에 이 쿼리를 실어 보낸다). 연 뒤에는
  // 쿼리를 지워서 새로고침해도 같은 팝업이 다시 안 뜨게 한다.
  const router = useRouter();
  const searchParams = useSearchParams();
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    if (quotations.some((q) => q.id === openId)) setEditingId(openId);
    router.replace("/dashboard/quotations");
  }, [searchParams, quotations, router]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [search, setSearch] = useState("");
  const editingQuotation =
    editingId && editingId !== "new" ? (quotations.find((q) => q.id === editingId) ?? null) : null;
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter(
      (item) =>
        item.customerName.toLowerCase().includes(q) ||
        (item.projectTitle ?? "").toLowerCase().includes(q) ||
        item.quoteNumber.toLowerCase().includes(q)
    );
  }, [quotations, search]);

  function handleDelete(id: string) {
    if (!window.confirm("이 산출내역을 삭제할까요?")) return;
    startTransition(() => {
      void deleteQuotation(id);
    });
    setEditingId(null);
  }

  const isEditing = editingId === "new" || Boolean(editingQuotation);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <button type="button" onClick={() => setEditingId(null)} className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingInline: 0 }}>
            ← 목록으로
          </button>
          <QuotationForm
            quotation={editingId === "new" ? null : editingQuotation}
            members={members}
            products={products}
            businessProjects={businessProjects}
            onDone={() => setEditingId(null)}
          />
          {editingQuotation && (
            <button type="button" onClick={() => handleDelete(editingQuotation.id)} className="btn btn-secondary btn-danger" style={{ alignSelf: "flex-start" }}>
              이 산출내역 삭제
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", overflow: "hidden" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4)", fontSize: 13 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="기관명·사업명·산출번호 검색" style={{ width: 240, marginBottom: 0 }} />
            <span className="text-muted" style={{ fontSize: 12 }}>
              전체 <strong style={{ color: "var(--color-text)" }}>{quotations.length.toLocaleString("ko-KR")}</strong>건 중{" "}
              <strong style={{ color: "var(--color-text)" }}>{filtered.length.toLocaleString("ko-KR")}</strong>건 표시 중입니다.
            </span>
            <div style={{ marginLeft: "auto" }}>
              <button type="button" onClick={() => setEditingId("new")} className="btn btn-primary">
                + 새 산출내역 만들기
              </button>
            </div>
          </div>

          {/* 모바일에서는 8열 표를 가로 스크롤해야 해서 다른 목록 화면들과 같은
              카드형(.mobile-card-table — components/industryTheme.css)으로 바꾸고,
              헤더 고정용 70vh 스크롤도 모바일에서는 푼다(.table-scroll-area,
              2026-09-14). 인쇄용/고객 공개 페이지는 이 목록과 별개라 그대로. */}
          <div className="table-scroll-area" style={{ maxHeight: "70vh", overflow: "auto", borderTop: "1px solid var(--color-divider)" }}>
            <table className="table gradient-table-head mobile-card-table">
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, paddingLeft: "var(--space-4)" }}>번호</th>
                  <th style={{ position: "sticky", top: 0 }}>산출일자</th>
                  <th style={{ position: "sticky", top: 0 }}>기관명·산출번호</th>
                  <th style={{ position: "sticky", top: 0 }}>산출명</th>
                  <th style={{ position: "sticky", top: 0 }}>연결 사업</th>
                  <th style={{ position: "sticky", top: 0 }}>담당</th>
                  <th style={{ position: "sticky", top: 0 }}>금액</th>
                  <th style={{ position: "sticky", top: 0 }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q, index) => (
                  <tr key={q.id}>
                    {/* 카드형에서는 행 번호가 의미 없어 모바일에서만 숨긴다 */}
                    <td className="text-muted list-cell-hide-mobile" style={{ paddingLeft: "var(--space-4)" }}>{index + 1}</td>
                    <td className="text-muted" data-label="산출일자" style={{ whiteSpace: "nowrap" }}>
                      {formatDate(q.quoteDate)}
                    </td>
                    <td className="list-cell-title">
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                          <span onClick={() => setEditingId(q.id)} className="detail-link" style={{ cursor: "pointer", whiteSpace: "normal", fontWeight: 600 }}>
                            {q.customerName}
                          </span>
                          <span className={q.status === "final" ? "tag tag-accent" : "tag tag-neutral"}>
                            {q.status === "final" ? "최종" : "임시"}
                          </span>
                        </div>
                        <span className="text-muted" style={{ fontSize: 12 }}>{q.quoteNumber}</span>
                      </div>
                    </td>
                    <td className="text-muted" data-label="산출명" style={{ whiteSpace: "normal" }}>
                      {q.projectTitle || "-"}
                    </td>
                    <td data-label="연결 사업">
                      {q.businessProjectTitle ? (
                        <span className="tag tag-outline">{q.businessProjectTitle}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="text-muted" data-label="담당">{q.managerName || "-"}</td>
                    <td data-label="금액" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatCurrency(q.totalAmount)}원</td>
                    <td data-label="관리">
                      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                        <button type="button" onClick={() => openQuotationPopup(q.id)} className="btn btn-ghost" style={{ fontSize: 12 }}>
                          인쇄
                        </button>
                        <button type="button" onClick={() => setEditingId(q.id)} className="btn btn-ghost" style={{ fontSize: 12 }}>
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(q.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, color: "var(--color-accent-900)" }}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr className="list-empty-row">
                    <td colSpan={8} className="text-muted" style={{ textAlign: "center", padding: "var(--space-6)" }}>
                      {quotations.length === 0 ? "등록된 산출내역이 없습니다." : "검색 결과가 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
