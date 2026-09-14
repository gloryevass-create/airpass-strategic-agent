"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import type { ProductCatalogItem } from "@/lib/queries/productCatalog";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  bulkImportProducts,
  bulkAssignVendor,
  toggleProductFavorite,
  moveProductInUserOrder,
  type BulkImportRow,
} from "@/app/dashboard/actions/productCatalog";
import {
  createProductCatalogWorkbook,
  parseProductCatalogWorkbook,
  type ProductCatalogImportRow,
} from "@/lib/productCatalogXlsx";
import { SearchInput } from "@/components/dashboard/SearchInput";

function formatWon(value: number | null): string {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatRate(value: number | null): string {
  if (value == null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(products: ProductCatalogItem[]) {
  const header = ["제품명", "규격", "단가", "공급방식", "수수료/마진율", "조달채널", "조달식별번호", "비고"].join(",");
  const rows = products.map((p) =>
    [
      p.name,
      p.specification ?? "",
      p.unitPrice != null ? String(p.unitPrice) : "",
      p.supplyType === "partner" ? "협력사" : "직공급",
      p.supplyType === "partner" ? formatRate(p.commissionRate) : formatRate(p.marginRate),
      p.procurementChannel ?? "",
      p.procurementNumber ?? "",
      p.note ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `제품카탈로그_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadWorkbook(items: ProductCatalogItem[], filename: string) {
  const bytes = createProductCatalogWorkbook(items).slice();
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ProductForm({
  product,
  onDone,
}: {
  product: ProductCatalogItem | null;
  onDone: () => void;
}) {
  const action = product ? updateProduct : createProduct;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [supplyType, setSupplyType] = useState<"partner" | "direct">(product?.supplyType ?? "partner");

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
        onDone();
      }}
      style={{ border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
    >
      {product && <input type="hidden" name="id" value={product.id} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <div className="field">
          <label>제품명 *</label>
          <input className="input" name="name" defaultValue={product?.name ?? ""} required />
        </div>
        <div className="field">
          <label>규격</label>
          <input className="input" name="specification" defaultValue={product?.specification ?? ""} />
        </div>
        <div className="field">
          <label>단가(원)</label>
          <input className="input" name="unitPrice" type="number" defaultValue={product?.unitPrice ?? ""} />
        </div>
        <div className="field">
          <label>공급방식</label>
          <select
            className="input"
            name="supplyType"
            value={supplyType}
            onChange={(e) => setSupplyType(e.target.value as "partner" | "direct")}
          >
            <option value="partner">협력사 공급 (수수료율)</option>
            <option value="direct">직공급 (마진율)</option>
          </select>
        </div>
        <div className="field">
          <label>{supplyType === "partner" ? "수수료율(%)" : "마진율(%)"}</label>
          <input
            className="input"
            name="rate"
            type="number"
            step="0.1"
            defaultValue={
              product
                ? ((supplyType === "partner" ? product.commissionRate : product.marginRate) ?? 0) * 100 || ""
                : ""
            }
          />
        </div>
        <div className="field">
          <label>참고 링크</label>
          <input className="input" name="reference" defaultValue={product?.reference ?? ""} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>비고 (G2B/S2B 등 조달 식별번호가 포함돼 있으면 자동으로 채널·번호를 인식합니다)</label>
          <input className="input" name="note" defaultValue={product?.note ?? ""} placeholder="예: ㈜에어패스 G2B : 24563902" />
        </div>
      </div>
      {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "저장 중..." : product ? "수정 저장" : "제품 추가"}
        </button>
        <button type="button" onClick={onDone} className="btn btn-secondary">
          취소
        </button>
      </div>
    </form>
  );
}

function ImportPreview({
  rows,
  onCancel,
  onImported,
}: {
  rows: ProductCatalogImportRow[];
  onCancel: () => void;
  onImported: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);

  function handleImport() {
    const payload: BulkImportRow[] = valid.map((r) => ({
      name: r.name,
      specification: r.specification,
      unitPrice: r.unitPrice,
      note: r.note,
      supplyType: r.supplyType,
      commissionRate: r.commissionRate,
      marginRate: r.marginRate,
      reference: r.reference,
    }));
    startTransition(async () => {
      const result = await bulkImportProducts(payload);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      onImported();
    });
  }

  return (
    <div style={{ border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <p style={{ fontSize: 13, margin: 0 }}>
        총 {rows.length}행 중 <strong style={{ color: "var(--color-accent-700)" }}>{valid.length}건 가져오기 가능</strong>
        {invalid.length > 0 && <span style={{ color: "var(--color-accent-900)" }}> · {invalid.length}건 오류(제외됨)</span>}
      </p>
      {invalid.length > 0 && (
        <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--color-divider)", padding: "var(--space-2)", fontSize: 12, color: "var(--color-accent-900)" }}>
          {invalid.map((r) => (
            <p key={r.rowNumber} style={{ margin: "2px 0" }}>
              {r.rowNumber}행 ({r.name || "이름 없음"}): {r.errors.join(", ")}
            </p>
          ))}
        </div>
      )}
      {message && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{message}</p>}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button type="button" onClick={handleImport} disabled={pending || valid.length === 0} className="btn btn-primary">
          {pending ? "가져오는 중..." : `${valid.length}건 가져오기`}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          취소
        </button>
      </div>
    </div>
  );
}

export function ProductCatalogTable({
  products,
  vendors,
}: {
  products: ProductCatalogItem[];
  vendors: { id: string; companyName: string }[];
}) {
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editing, setEditing] = useState<ProductCatalogItem | null | "new">(null);
  const [importRows, setImportRows] = useState<ProductCatalogImportRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkVendorId, setBulkVendorId] = useState<string>("__choose__");
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 클릭 즉시 화면에 반영되도록 로컬에서 먼저 뒤집어 보여준다. 서버 액션 완료 후
  // router.refresh()를 부르지 않으므로(화살표 연타 시 매번 전체 재조회가 쌓여 앱
  // 전체가 느려지는 원인이었다, 사용자 확인 2026-08-27) 다음 실제 페이지 이동/새로고침
  // 전까지는 이 오버라이드가 유일한 표시 기준이다 — products prop이 새로 내려오면
  // 그때 자연스럽게 실제 값과 합쳐진다.
  const [favoriteOverrides, setFavoriteOverrides] = useState<Map<string, boolean>>(new Map());
  // 화살표도 같은 이유로 로컬에서 먼저 순서를 바꿔 보여준다.
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);

  const productsWithOverrides = useMemo(() => {
    let base = products.map((p) =>
      favoriteOverrides.has(p.id) ? { ...p, isFavorite: favoriteOverrides.get(p.id)! } : p
    );
    if (orderOverride) {
      const byId = new Map(base.map((p) => [p.id, p]));
      const reordered: ProductCatalogItem[] = [];
      for (const id of orderOverride) {
        const item = byId.get(id);
        if (item) {
          reordered.push(item);
          byId.delete(id);
        }
      }
      reordered.push(...byId.values());
      base = reordered;
    }
    // 즐겨찾기 누르면 그 즉시 맨 위로 옮겨 보이도록, 낙관적 업데이트 반영 직후에도
    // 항상 즐겨찾기 그룹이 먼저 오게 다시 묶는다(서버 쿼리도 같은 규칙을 적용).
    return [...base.filter((p) => p.isFavorite), ...base.filter((p) => !p.isFavorite)];
  }, [products, favoriteOverrides, orderOverride]);

  const favoriteCount = useMemo(
    () => productsWithOverrides.filter((p) => p.isFavorite).length,
    [productsWithOverrides]
  );

  const filtered = useMemo(() => {
    let list = productsWithOverrides;
    if (favoritesOnly) list = list.filter((p) => p.isFavorite);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.specification ?? "").toLowerCase().includes(q) ||
          (p.note ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [productsWithOverrides, search, favoritesOnly]);

  // 화살표 순서 변경은 전체 116건 기준 순서를 바꾸는데, 검색·즐겨찾기 필터가 걸려 있으면
  // 맞바뀔 상대가 화면에 안 보여서 "눌러도 아무 반응 없는 것처럼" 보인다 — 필터가 없을
  // 때만 허용한다.
  const canReorder = !search.trim() && !favoritesOnly;

  // 낙관적 업데이트(favoriteOverrides/orderOverride)가 이미 화면에 정확한 결과를
  // 즉시 반영하므로, 클릭마다 router.refresh()로 서버 컴포넌트를 다시 실행해
  // product_catalog 전체를 재조회할 필요가 없다 — 화살표를 연타하면 그때마다
  // 불필요한 왕복 쿼리가 쌓여 전체 앱이 느려지는 원인이었다(사용자 확인,
  // 2026-08-27). 페이지를 새로고침/재방문하면 서버 데이터로 자연히 맞춰진다.
  function handleToggleFavorite(id: string) {
    const current = productsWithOverrides.find((p) => p.id === id)?.isFavorite ?? false;
    setFavoriteOverrides((prev) => new Map(prev).set(id, !current));
    startTransition(async () => {
      await toggleProductFavorite(id);
    });
  }

  function handleMove(id: string, direction: "up" | "down") {
    const index = productsWithOverrides.findIndex((p) => p.id === id);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= productsWithOverrides.length) return;
    // 즐겨찾기 그룹 경계는 넘지 않는다(서버 액션과 동일한 규칙).
    if (productsWithOverrides[index].isFavorite !== productsWithOverrides[targetIndex].isFavorite) return;

    const newOrder = productsWithOverrides.map((p) => p.id);
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setOrderOverride(newOrder);

    startTransition(async () => {
      await moveProductInUserOrder(id, direction);
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("이 제품을 삭제할까요?")) return;
    startTransition(() => {
      void deleteProduct(id);
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))));
  }

  function handleBulkAssign() {
    if (bulkVendorId === "__choose__" || selected.size === 0) return;
    const vendorId = bulkVendorId === "__none__" ? null : bulkVendorId;
    startTransition(() => {
      void bulkAssignVendor(Array.from(selected), vendorId);
    });
    setSelected(new Set());
    setBulkVendorId("__choose__");
  }

  async function handleFileSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    try {
      const rows = parseProductCatalogWorkbook(await file.arrayBuffer());
      setImportRows(rows);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "엑셀 파일을 읽지 못했습니다.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {importRows && (
        <ImportPreview rows={importRows} onCancel={() => setImportRows(null)} onImported={() => setImportRows(null)} />
      )}
      {editing === "new" && <ProductForm product={null} onDone={() => setEditing(null)} />}
      {editing && editing !== "new" && <ProductForm product={editing} onDone={() => setEditing(null)} />}

      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4)", fontSize: 13 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="제품명·규격·비고 검색" style={{ width: 220, marginBottom: 0 }} />
          <span className="text-muted" style={{ fontSize: 12 }}>
            전체 <strong style={{ color: "var(--color-text)" }}>{products.length.toLocaleString("ko-KR")}</strong>건 중{" "}
            <strong style={{ color: "var(--color-text)" }}>{filtered.length.toLocaleString("ko-KR")}</strong>건 표시 중입니다.
          </span>
          <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            <button type="button" onClick={() => downloadCsv(products)} className="btn btn-secondary">
              CSV 다운로드
            </button>
            <button type="button" onClick={() => downloadWorkbook([], "제품카탈로그_양식.xlsx")} className="btn btn-secondary">
              엑셀 양식 다운로드
            </button>
            <button
              type="button"
              onClick={() => downloadWorkbook(products, `제품카탈로그_${new Date().toISOString().slice(0, 10)}.xlsx`)}
              className="btn btn-secondary"
            >
              엑셀 내보내기
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary">
              엑셀로 가져오기
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void handleFileSelected(e.target.files)}
              hidden
            />
            <button type="button" onClick={() => setEditing("new")} className="btn btn-primary">
              + 새 제품 추가
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", borderTop: "1px solid var(--color-divider)", padding: "var(--space-2) var(--space-4)" }}>
          <button type="button" onClick={() => setFavoritesOnly(false)} className={`seg-opt${!favoritesOnly ? " active" : ""}`} style={{ border: "1px solid var(--color-divider)" }}>
            전체
          </button>
          <button
            type="button"
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`seg-opt${favoritesOnly ? " active" : ""}`}
            style={{ border: "1px solid var(--color-divider)" }}
          >
            ★ 즐겨찾기 {favoriteCount.toLocaleString("ko-KR")}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-3)",
            borderTop: "1px solid var(--color-divider)",
            padding: "var(--space-3)",
            fontSize: 12,
            background: selected.size > 0 ? "var(--color-accent-100)" : undefined,
          }}
        >
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }} className="text-muted">
            <input
              type="checkbox"
              checked={filtered.length > 0 && selected.size === filtered.length}
              onChange={toggleSelectAll}
              style={{ accentColor: "var(--color-accent)" }}
            />
            현재 목록 전체 선택
          </label>
          <span className="tag tag-neutral">{selected.size.toLocaleString("ko-KR")}개 선택됨</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <select
              value={bulkVendorId}
              onChange={(e) => setBulkVendorId(e.target.value)}
              disabled={selected.size === 0}
              className="input"
              style={{ minHeight: 30, fontSize: 12 }}
            >
              <option value="__choose__">공급 제조사 선택</option>
              <option value="__none__">제조사 연결 해제</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.companyName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkAssign}
              disabled={selected.size === 0 || bulkVendorId === "__choose__"}
              className="btn btn-primary"
              style={{ flex: "none", whiteSpace: "nowrap" }}
            >
              적용
            </button>
          </div>
        </div>

        {/* 모바일에서는 9열 표를 가로 스크롤해야 봐야 해서, 다른 목록 화면들과
            같은 카드형(.mobile-card-table — components/industryTheme.css)으로
            바꾼다(2026-09-14). 바깥 70vh 스크롤 영역도 모바일에서는 페이지
            스크롤 안에 또 스크롤이 생겨 불편하므로 풀어준다(.table-scroll-area). */}
        <div className="table-scroll-area" style={{ maxHeight: "70vh", overflow: "auto", borderTop: "1px solid var(--color-divider)" }}>
          <table className="table mobile-card-table">
            <thead>
              <tr>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>선택·품명</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>규격</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>단가</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>공급방식</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>제조사</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>수수료/마진율</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>조달정보</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>비고</th>
                <th style={{ position: "sticky", top: 0, background: "#ffffff" }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, index) => {
                const reorderDisabledReason = !canReorder
                  ? "정렬 순서 변경은 검색어·즐겨찾기 필터 없이 전체 보기에서만 가능합니다."
                  : null;
                // 즐겨찾기는 항상 맨 위 그룹으로 묶여 보이므로, 그 그룹 경계를 넘는 이동은 막는다
                // (참고 사이트와 동일 — 일반 항목 자리로 즐겨찾기가 섞여 들어가지 않게).
                const prev = filtered[index - 1];
                const next = filtered[index + 1];
                const canMoveUp = canReorder && index > 0 && prev.isFavorite === p.isFavorite;
                const canMoveDown = canReorder && index < filtered.length - 1 && next.isFavorite === p.isFavorite;
                return (
                  <tr key={p.id} style={{ background: p.isFavorite ? "var(--color-accent-100)" : undefined }}>
                    <td className="list-cell-title">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ accentColor: "var(--color-accent)" }} />
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(p.id)}
                          title={p.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                          className="btn btn-ghost btn-icon"
                          style={{ color: p.isFavorite ? "#e3a51b" : undefined, fontSize: 15 }}
                        >
                          {p.isFavorite ? "★" : "☆"}
                        </button>
                        <div style={{ display: "flex", flex: "none", gap: 2 }}>
                          <button
                            type="button"
                            onClick={() => handleMove(p.id, "up")}
                            disabled={!canMoveUp}
                            title={reorderDisabledReason ?? "위로"}
                            className="btn btn-secondary btn-icon"
                            style={{ width: 22, height: 22, fontSize: 11, minHeight: "auto" }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(p.id, "down")}
                            disabled={!canMoveDown}
                            title={reorderDisabledReason ?? "아래로"}
                            className="btn btn-secondary btn-icon"
                            style={{ width: 22, height: 22, fontSize: 11, minHeight: "auto" }}
                          >
                            ↓
                          </button>
                        </div>
                        {p.needsReview && <span style={{ color: "var(--color-accent-900)" }}>!</span>}
                        <span style={{ whiteSpace: "normal" }}>{p.name}</span>
                      </div>
                    </td>
                    <td className="text-muted" data-label="규격" style={{ whiteSpace: "normal" }}>
                      {p.specification ?? "-"}
                    </td>
                    <td data-label="단가" style={{ fontWeight: 600 }}>{formatWon(p.unitPrice)}</td>
                    <td className="text-muted" data-label="공급방식">{p.supplyType === "partner" ? "협력사" : "직공급"}</td>
                    <td className="text-muted" data-label="제조사">{p.supplierVendorName ?? "-"}</td>
                    {/* 데스크톱 헤더는 "수수료/마진율" 한 칸이지만, 모바일 카드에서는
                        공급방식에 따라 둘 중 실제로 표시되는 쪽만 라벨로 보여준다. */}
                    <td data-label={p.supplyType === "partner" ? "수수료율" : "마진율"}>
                      {(p.supplyType === "partner" ? p.commissionRate : p.marginRate) != null ? (
                        <span className="tag tag-accent">{formatRate(p.supplyType === "partner" ? p.commissionRate : p.marginRate)}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td data-label="조달정보">
                      {p.procurement ? (
                        <span className="tag tag-outline">{`${p.procurementChannel ?? ""} ${p.procurementNumber ?? ""}`.trim()}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="text-muted" data-label="비고" style={{ whiteSpace: "normal" }}>
                      {p.note ?? "-"}
                    </td>
                    <td data-label="관리">
                      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                        <button type="button" onClick={() => setEditing(p)} className="btn btn-ghost" style={{ fontSize: 12 }}>
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="btn btn-ghost"
                          style={{ fontSize: 12, color: "var(--color-accent-900)" }}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr className="list-empty-row">
                  <td colSpan={9} className="text-muted" style={{ textAlign: "center", padding: "var(--space-6)" }}>
                    조건에 맞는 제품이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
