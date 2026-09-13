// 개인별 폰트 설정(profiles.font_preference/sidebar_font_preference, 2026-09-08~)의
// 단일 출처. app/dashboard/layout.tsx(실제 --font-sans 오버라이드 적용)와
// components/ProfileForm.tsx(선택 드롭다운 + 실제 폰트로 렌더링되는 미리보기,
// 2026-09-10 추가 — 드롭다운에 적힌 이름만 보고는 실제 어떤 폰트가 적용된 건지
// 알 수 없다는 사용자 피드백으로 도입) 양쪽에서 이 배열 하나만 참조한다.
export type FontPreferenceId =
  | "pretendard"
  | "system"
  | "gmarket"
  | "nanumsquare"
  | "noto"
  | "omudaye"
  | "lineseed"
  | "nanumsquareneo";

export type FontPreferenceOption = {
  id: FontPreferenceId;
  label: string;
  /** globals.css @font-face/@import로 이미 전역 로드해 둔 폰트의 font-family 스택.
   * "pretendard"는 app/globals.css의 --font-sans 기본값을 그대로 쓰므로(따로
   * 덮어쓸 값이 없음) undefined. */
  stack?: string;
  /** industryTheme.css --font-heading-weight 기본값(600)이 이 폰트엔 없어서
   * 같이 덮어써야 하는 경우만 지정 — 없으면 기본값(600) 그대로 쓴다. */
  headingWeight?: number;
};

// app/globals.css의 --font-sans 기본값과 반드시 같은 문자열로 유지한다 —
// "pretendard" 옵션은 따로 오버라이드하지 않고 이 전역 기본값을 그대로 쓰기
// 때문에, 그 사실을 미리보기(ProfileForm.tsx)에서도 재현하려면 이 문자열이
// 필요하다.
export const PRETENDARD_DEFAULT_STACK =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", Roboto, Helvetica, Arial, sans-serif';

const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", Roboto, Helvetica, Arial, sans-serif';
// G마켓 산스(2026-09-08 추가, 사용자 제공 @font-face) — 300/500/700 세 굵기만 있어
// industryTheme.css가 기본으로 쓰는 --font-heading-weight: 600이 정확히 없다.
// 이 폰트를 고른 사람만 700(Bold)로 같이 덮어써서 헤딩이 어중간한 굵기로
// 대체되지 않게 한다(가장 눈에 띄는 요소라 우선 처리, 본문 400은 브라우저의
// 가장 가까운 굵기 자동 대체에 맡김).
const GMARKET_FONT_STACK = '"GMarketSans", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
// 나눔스퀘어(2026-09-08 추가) — 300/400/700/800 네 굵기가 있어 본문 400은
// 그대로 맞지만 헤딩용 600은 역시 없어서 G마켓 산스와 같은 이유로 700을 쓴다.
const NANUMSQUARE_FONT_STACK = '"NanumSquare", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
// 본고딕/Noto Sans KR(2026-09-08 추가) — 100~900 9단계가 전부 있어 600이 정확히
// 있다. G마켓 산스/나눔스퀘어와 달리 --font-heading-weight를 덮어쓸 필요가 없다.
const NOTO_FONT_STACK = '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
// 오뮤 다예쁨체(2026-09-08 추가) — 손글씨풍 폰트라 굵기가 normal(400) 하나뿐이다.
// 헤딩용 600을 그대로 두면 브라우저가 합성 굵게(synthetic bold)를 적용해 손글씨
// 획이 뭉개져 보이므로, 헤딩도 400으로 낮춰 유일한 실제 굵기를 그대로 쓴다.
const OMUDAYE_FONT_STACK = '"OmuDaye", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
// LINE Seed(2026-09-08 추가) — 100/400/700 세 굵기만 있어 G마켓 산스/나눔스퀘어와
// 같은 이유로 600이 정확히 없다 — 헤딩용 700으로 덮어쓴다.
const LINESEED_FONT_STACK = '"LineSeed", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
// 나눔스퀘어 네오(2026-09-13 추가) — 나눔스퀘어의 후속 리뉴얼판. 300/400/700/800/900
// 다섯 굵기가 있어 나눔스퀘어와 같은 이유로 600이 없다 — 헤딩용 700으로 덮어쓴다.
const NANUMSQUARENEO_FONT_STACK = '"NanumSquareNeo", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';

export const FONT_OPTIONS: FontPreferenceOption[] = [
  { id: "pretendard", label: "Pretendard (기본)" },
  { id: "system", label: "시스템 기본 폰트", stack: SYSTEM_FONT_STACK },
  { id: "gmarket", label: "G마켓 산스", stack: GMARKET_FONT_STACK, headingWeight: 700 },
  { id: "nanumsquare", label: "나눔스퀘어", stack: NANUMSQUARE_FONT_STACK, headingWeight: 700 },
  { id: "noto", label: "본고딕 (Noto Sans KR)", stack: NOTO_FONT_STACK },
  { id: "omudaye", label: "오뮤 다예쁨체", stack: OMUDAYE_FONT_STACK, headingWeight: 400 },
  { id: "lineseed", label: "LINE Seed", stack: LINESEED_FONT_STACK, headingWeight: 700 },
  { id: "nanumsquareneo", label: "나눔스퀘어 네오", stack: NANUMSQUARENEO_FONT_STACK, headingWeight: 700 },
];
