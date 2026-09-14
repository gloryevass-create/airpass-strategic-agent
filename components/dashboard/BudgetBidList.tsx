"use client";

import { useMemo, useState } from "react";
import type { BudgetBid } from "@/lib/queries/budget";
import { useScrapToolbar } from "@/lib/hooks/useScrapToolbar";
import {
  cardTable,
  cardThead,
  cardRow,
  cardCell,
  cardTitleCell,
  cardEmptyRow,
  cardEmptyCell,
} from "@/components/dashboard/mobileCardTable";

const BUSINESS_TYPE_LABEL: Record<BudgetBid["businessType"], string> = {
  cnstwk: "공사",
  servc: "용역",
  thng: "물품",
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatWon(amount: number | null) {
  if (amount == null) return "-";
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export function BudgetBidList({
  bids,
  scrapedBids,
  registeredKeywords,
  scrapedIds,
  path,
}: {
  bids: BudgetBid[];
  scrapedBids: BudgetBid[];
  registeredKeywords: string[];
  scrapedIds: Set<string>;
  path: string;
}) {
  // 등록된 키워드는 이번 조회 기간에 매칭된 공고가 0건이어도 항상 탭에 보여야 한다 —
  // 그렇지 않으면 "키워드를 등록했는데 화면에 아무 흔적이 없다"는 혼란이 생긴다. 데이터에만
  // 있고 목록에서 삭제된 키워드도(과거 기록이니) 계속 보여준다. 스크랩한 공고가 조회
  // 기간 밖에 있어도 그 키워드가 탭에 보이도록 scrapedBids도 함께 반영한다.
  const keywords = useMemo(() => {
    const set = new Set([...registeredKeywords, ...bids.map((b) => b.keyword), ...scrapedBids.map((b) => b.keyword)]);
    return ["전체", ...Array.from(set).sort()];
  }, [registeredKeywords, bids, scrapedBids]);
  const [filter, setFilter] = useState("전체");
  const scrap = useScrapToolbar("budget", path);

  // "스크랩" 탭은 조회 기간으로 걸러진 bids가 아니라, 기간과 무관하게 항상 불러온
  // scrapedBids를 기준으로 삼는다 — 그래야 스크랩한 공고가 조회 기간 밖으로 밀려나도
  // (다음날 자동 수집으로 30일 롤링 윈도우가 앞으로 이동) 스크랩 탭에서 계속 보인다.
  const scrapPool = useMemo(() => {
    const map = new Map(scrapedBids.map((b) => [b.id, b]));
    for (const b of bids) if (!map.has(b.id)) map.set(b.id, b);
    return Array.from(map.values());
  }, [bids, scrapedBids]);

  const filtered = useMemo(() => {
    const pool = scrap.view === "scrap" ? scrapPool.filter((b) => scrapedIds.has(b.id)) : bids;
    return filter === "전체" ? pool : pool.filter((b) => b.keyword === filter);
  }, [bids, scrapPool, filter, scrap.view, scrapedIds]);

  if (keywords.length <= 1) {
    return (
      <div className="rounded-sm border border-hairline bg-canvas-cream p-6 text-center text-sm text-ink-mute">
        등록된 검색 키워드가 없습니다. 위에서 키워드를 추가해 주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {keywords.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                filter === k ? "bg-primary text-white" : "bg-canvas-cream text-ink-mute hover:text-ink"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-canvas-cream p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => scrap.switchView("all")}
              className={`rounded-lg px-3 py-1 transition-colors ${
                scrap.view === "all" ? "bg-primary text-white shadow-sm" : "text-ink-mute hover:text-ink"
              }`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => scrap.switchView("scrap")}
              className={`rounded-lg px-3 py-1 transition-colors ${
                scrap.view === "scrap" ? "bg-primary text-white shadow-sm" : "text-ink-mute hover:text-ink"
              }`}
            >
              스크랩 ({scrapedIds.size})
            </button>
          </div>
          {scrap.selected.size > 0 &&
            (scrap.view === "all" ? (
              <button
                type="button"
                onClick={scrap.scrapSelected}
                disabled={scrap.pending}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white hover:bg-primary-press disabled:opacity-50"
              >
                선택한 {scrap.selected.size}건 스크랩
              </button>
            ) : (
              <button
                type="button"
                onClick={scrap.unscrapSelected}
                disabled={scrap.pending}
                className="rounded-lg bg-canvas-cream px-4 py-1.5 text-xs font-bold text-ink hover:bg-hairline disabled:opacity-50"
              >
                선택한 {scrap.selected.size}건 스크랩 해제
              </button>
            ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-sm border border-hairline bg-canvas-cream max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
        <table className={cardTable}>
          <thead className={cardThead}>
            <tr>
              <th className="w-8 px-4 py-2">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((b) => scrap.selected.has(b.id))}
                  onChange={() => scrap.toggleAll(filtered.map((b) => b.id))}
                  aria-label="전체 선택"
                />
              </th>
              <th className="px-4 py-2 font-medium">키워드</th>
              <th className="px-4 py-2 font-medium">구분</th>
              <th className="px-4 py-2 font-medium">사업명</th>
              <th className="px-4 py-2 font-medium">발주기관</th>
              <th className="px-4 py-2 font-medium">예산금액</th>
              <th className="px-4 py-2 font-medium">공고일</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr
                key={b.id}
                className={cardRow(
                  scrapedIds.has(b.id) ? "bg-canvas-lavender/20" : "odd:bg-white even:bg-[#f7f7f8] max-md:bg-white"
                )}
              >
                <td className="px-4 py-2 max-md:px-0 max-md:py-0.5">
                  <input
                    type="checkbox"
                    checked={scrap.selected.has(b.id)}
                    onChange={() => scrap.toggle(b.id)}
                    aria-label={`${b.title} 선택`}
                  />
                </td>
                <td className={cardCell} data-label="키워드">
                  <span className="rounded-full bg-canvas-lavender px-2 py-0.5 text-xs font-medium text-primary">
                    {b.keyword}
                  </span>
                </td>
                <td className={`${cardCell} text-ink-mute`} data-label="구분">
                  {BUSINESS_TYPE_LABEL[b.businessType]}
                </td>
                <td className={cardTitleCell}>
                  {scrapedIds.has(b.id) && <span className="mr-1 text-primary">★</span>}
                  {b.detailUrl ? (
                    <a
                      href={b.detailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link-blue hover:underline"
                    >
                      {b.title}
                    </a>
                  ) : (
                    b.title
                  )}
                </td>
                <td className={`${cardCell} text-ink-mute`} data-label="발주기관">
                  {b.noticeInst ?? "-"}
                </td>
                <td className={cardCell} data-label="예산금액">
                  <span>
                    {formatWon(b.budgetAmount ?? b.presmptPrice)}
                    {b.budgetAmount == null && b.presmptPrice != null && (
                      <span className="ml-1 text-xs text-ink-mute">(추정가격)</span>
                    )}
                  </span>
                </td>
                <td className={`${cardCell} text-ink-mute`} data-label="공고일">
                  {formatDate(b.noticeDate)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr className={cardEmptyRow}>
                <td colSpan={7} className={cardEmptyCell}>
                  {scrap.view === "scrap"
                    ? "스크랩한 공고가 없습니다."
                    : filter === "전체"
                      ? "선택한 기간에 수집된 입찰공고가 없습니다."
                      : `"${filter}" 키워드로 수집된 입찰공고가 없습니다(다음 자동 수집 때 다시 시도합니다).`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
