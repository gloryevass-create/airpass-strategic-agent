"use client";

import { useMemo, useState } from "react";
import type { PrespecNotice } from "@/lib/queries/prespec";
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

const BUSINESS_TYPE_LABEL: Record<PrespecNotice["businessType"], string> = {
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

export function PrespecNoticeList({
  notices,
  scrapedNotices,
  registeredKeywords,
  scrapedIds,
  path,
}: {
  notices: PrespecNotice[];
  scrapedNotices: PrespecNotice[];
  registeredKeywords: string[];
  scrapedIds: Set<string>;
  path: string;
}) {
  // 등록된 키워드는 이번 조회 기간에 매칭된 사전규격이 0건이어도 항상 탭에 보여야 한다 —
  // budget_bids와 동일한 이유(BudgetBidList 참고). 스크랩한 사전규격이 조회 기간 밖에
  // 있어도 그 키워드가 탭에 보이도록 scrapedNotices도 함께 반영한다.
  const keywords = useMemo(() => {
    const set = new Set([
      ...registeredKeywords,
      ...notices.map((n) => n.keyword),
      ...scrapedNotices.map((n) => n.keyword),
    ]);
    return ["전체", ...Array.from(set).sort()];
  }, [registeredKeywords, notices, scrapedNotices]);
  const [filter, setFilter] = useState("전체");
  const scrap = useScrapToolbar("prespec", path);

  // "스크랩" 탭은 조회 기간으로 걸러진 notices가 아니라, 기간과 무관하게 항상 불러온
  // scrapedNotices를 기준으로 삼는다 — 그래야 스크랩한 사전규격이 조회 기간 밖으로
  // 밀려나도(다음날 자동 수집으로 30일 롤링 윈도우가 앞으로 이동) 스크랩 탭에서 계속 보인다.
  const scrapPool = useMemo(() => {
    const map = new Map(scrapedNotices.map((n) => [n.id, n]));
    for (const n of notices) if (!map.has(n.id)) map.set(n.id, n);
    return Array.from(map.values());
  }, [notices, scrapedNotices]);

  const filtered = useMemo(() => {
    const pool = scrap.view === "scrap" ? scrapPool.filter((n) => scrapedIds.has(n.id)) : notices;
    return filter === "전체" ? pool : pool.filter((n) => n.keyword === filter);
  }, [notices, scrapPool, filter, scrap.view, scrapedIds]);

  if (keywords.length <= 1) {
    return (
      <div className="rounded-sm border border-hairline bg-canvas-cream p-6 text-center text-sm text-ink-mute">
        등록된 검색 키워드가 없습니다. 조달입찰공고(/dashboard/budget)에서 키워드를 추가해
        주세요 — 같은 키워드 목록을 사전규격 검색에도 씁니다.
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
                  checked={filtered.length > 0 && filtered.every((n) => scrap.selected.has(n.id))}
                  onChange={() => scrap.toggleAll(filtered.map((n) => n.id))}
                  aria-label="전체 선택"
                />
              </th>
              <th className="px-4 py-2 font-medium">키워드</th>
              <th className="px-4 py-2 font-medium">구분</th>
              <th className="min-w-[360px] px-4 py-2 font-medium">사업명</th>
              <th className="max-w-[220px] px-4 py-2 font-medium">발주기관</th>
              <th className="px-4 py-2 font-medium">배정예산</th>
              <th className="px-4 py-2 font-medium">등록일</th>
              <th className="px-4 py-2 font-medium">의견마감일</th>
              <th className="px-4 py-2 font-medium">담당자</th>
              <th className="px-4 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <tr
                key={n.id}
                className={cardRow(
                  scrapedIds.has(n.id) ? "bg-canvas-lavender/20" : "odd:bg-white even:bg-[#f7f7f8] max-md:bg-white"
                )}
              >
                <td className="px-4 py-2 max-md:px-0 max-md:py-0.5">
                  <input
                    type="checkbox"
                    checked={scrap.selected.has(n.id)}
                    onChange={() => scrap.toggle(n.id)}
                    aria-label={`${n.title} 선택`}
                  />
                </td>
                <td className={cardCell} data-label="키워드">
                  <span className="rounded-full bg-canvas-lavender px-2 py-0.5 text-xs font-medium text-primary">
                    {n.keyword}
                  </span>
                </td>
                <td className={`${cardCell} text-ink-mute`} data-label="구분">
                  {BUSINESS_TYPE_LABEL[n.businessType]}
                </td>
                <td className={`${cardTitleCell} md:min-w-[360px]`}>
                  {scrapedIds.has(n.id) && <span className="mr-1 text-primary">★</span>}
                  {n.specDocUrls[0] ? (
                    <a
                      href={n.specDocUrls[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link-blue hover:underline"
                    >
                      {n.title}
                    </a>
                  ) : (
                    n.title
                  )}
                </td>
                <td className={`${cardCell} text-ink-mute md:max-w-[220px] md:whitespace-normal`} data-label="발주기관">
                  {n.noticeInst ?? "-"}
                </td>
                <td className={cardCell} data-label="배정예산">
                  {formatWon(n.budgetAmount)}
                </td>
                <td className={`${cardCell} text-ink-mute`} data-label="등록일">
                  {formatDate(n.registeredAt)}
                </td>
                <td className={`${cardCell} text-ink-mute`} data-label="의견마감일">
                  {formatDate(n.opinionCloseAt)}
                </td>
                <td className={`${cardCell} text-ink-mute`} data-label="담당자">
                  <span>
                    {n.officialName ?? "-"}
                    {n.officialTel && <span className="ml-1">({n.officialTel})</span>}
                  </span>
                </td>
                <td className={cardCell} data-label="상태">
                  {n.bidNoticeNos.length > 0 ? (
                    <span className="rounded-full bg-semantic-success/15 px-2 py-0.5 text-xs font-medium text-semantic-success">
                      입찰공고 전환됨
                    </span>
                  ) : (
                    <span className="text-xs text-ink-mute">의견수렴 중</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr className={cardEmptyRow}>
                <td colSpan={10} className={cardEmptyCell}>
                  {scrap.view === "scrap"
                    ? "스크랩한 사전규격이 없습니다."
                    : filter === "전체"
                      ? "선택한 기간에 수집된 사전규격이 없습니다."
                      : `"${filter}" 키워드로 수집된 사전규격이 없습니다(다음 자동 수집 때 다시 시도합니다).`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
