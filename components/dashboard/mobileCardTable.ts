// 조달입찰공고·사전규격 목록처럼 열이 많은 표를 좁은 화면에서 가로 스크롤 없이
// 보게 하는 "카드형" 전환용 Tailwind 클래스 모음(2026-09-14).
//
// Industry 테마 화면(SI Business·산출내역·제품 카탈로그 등)은 같은 전환을
// components/industryTheme.css의 .mobile-card-table 규칙으로 처리하지만, 이
// 두 화면은 Tailwind로 그려져 있어 그 CSS(.industry-theme 하위로 스코프됨)가
// 닿지 않는다 — 그래서 같은 아이디어를 Tailwind 유틸리티로 옮겨 담았다.
//
// 쓰는 법: <table className={cardTable}>, <thead className={cardThead}>,
// <tr className={cardRow(...)}>, <td className={cardCell} data-label="발주기관">.
// 제목처럼 크게 보여줄 칸에는 cardTitleCell을 쓰고 data-label은 생략한다.

/** 모바일에서만 줄바꿈 허용(데스크톱은 기존처럼 nowrap 유지) */
export const cardTable = "w-full text-sm md:whitespace-nowrap";

/** 카드형에서는 열 제목 행이 필요 없다 — 각 칸이 data-label을 직접 보여준다 */
export const cardThead = "hidden bg-[#f7f7f8] text-left text-ink-mute md:table-header-group";

/** 행 하나 = 카드 한 장. rowExtra로 선택/스크랩 배경색 등을 덧붙인다. */
export function cardRow(rowExtra: string): string {
  return [
    "max-md:mb-3 max-md:flex max-md:flex-col max-md:gap-0.5 max-md:rounded-lg max-md:border max-md:border-hairline max-md:p-3",
    "md:border-t md:border-hairline",
    rowExtra,
  ].join(" ");
}

/** 라벨(data-label) + 값이 한 줄로 붙는 일반 칸 */
export const cardCell =
  "px-4 py-2 max-md:flex max-md:gap-2 max-md:px-0 max-md:py-0.5 max-md:whitespace-normal" +
  " max-md:before:w-20 max-md:before:shrink-0 max-md:before:text-xs max-md:before:text-ink-mute" +
  " max-md:before:content-[attr(data-label)]";

/** 카드 맨 위에 오는 제목 칸 — 라벨 없이 크게, 아래 항목들과 선으로 구분 */
export const cardTitleCell =
  "px-4 py-2 whitespace-normal max-md:order-first max-md:mb-1 max-md:border-b max-md:border-hairline" +
  " max-md:px-0 max-md:pt-0 max-md:pb-2 max-md:font-medium";

/** 검색 결과 없음 행 — 카드 테두리 대신 안내 문구만 */
export const cardEmptyRow = "max-md:block";
export const cardEmptyCell = "px-4 py-6 text-center text-ink-mute max-md:block";
