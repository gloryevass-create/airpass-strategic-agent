import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "@/lib/types/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

type Client = SupabaseClient<Database>;

const TREND_DAYS = 14;
const ACCOUNT_STATS_TREND_DAYS = 7;

function daysBefore(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 대시보드 전체가 이 날짜를 기준으로 동작한다 — 특정 날짜 하드코딩 금지.
 * 모든 대시보드 페이지(app/dashboard/layout.tsx)가 매 요청마다 이 함수를 부르므로,
 * 하루 한 번만 갱신되는 파이프라인 데이터에 매번 Supabase를 왕복하지 않도록
 * admin 클라이언트 + unstable_cache(1시간 재검증)로 감싼다. 인증 게이트는 호출부의
 * requireAuthedClient()가 담당하므로 이 함수는 supabase 클라이언트 인자를 받지 않는다. */
const getCachedLatestDataDate = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("keyword_daily_metrics")
      .select("date")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.date ?? null;
  },
  ["latest-data-date"],
  { revalidate: 3600 }
);

export async function getLatestDataDate(): Promise<string | null> {
  return getCachedLatestDataDate();
}

/** ad_account_daily_stats도 같은 원칙 — 서버 시계(UTC)로 "오늘"을 계산하면 파이프라인의
 * KST 기준과 자정 근처에 하루 어긋날 수 있으므로, 실제 수집된 마지막 날짜를 앵커로 쓴다. */
async function getLatestAccountStatsDate(supabase: Client): Promise<string | null> {
  const { data } = await supabase
    .from("ad_account_daily_stats")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.date ?? null;
}

export type DashboardData = {
  latestDate: string | null;
  kpi: {
    activeKeywordCount: number;
    avgRank: number | null;
    alertCount: number;
  };
  adAccountStats: {
    latestDate: string | null;
    bizmoney: number | null;
    totals: { impCnt: number; clkCnt: number; avgCpc: number; avgCpm: number };
    trend: { date: string; impCnt: number; clkCnt: number; cpc: number; cpm: number }[];
    range: { since: string; until: string };
  };
  rankTrend: { date: string; avgRank: number | null }[];
  keywordTable: {
    keywordId: string;
    keyword: string;
    ourRank: number | null;
    avgCpc: number | null;
    monthlySearchPc: number | null;
    monthlySearchMobile: number | null;
    monthlyClickPc: number | null;
    monthlyClickMobile: number | null;
    competitionLevel: string | null;
    spend7d: number | null;
  }[];
  contentMatchedKeywords: {
    keywordId: string;
    keyword: string;
    monthlySearchPc: number | null;
    monthlySearchMobile: number | null;
    monthlyClickPc: number | null;
    monthlyClickMobile: number | null;
    avgCpc: number | null;
    matchCount: number;
  }[];
  sov: { competitorId: string; competitorName: string; sharePct: number }[];
  sovTrend: {
    keys: string[];
    rows: Record<string, number | string>[];
  };
  cadence: {
    competitorId: string;
    competitorName: string;
    blogId: string | null;
    avgIntervalDays: number | null;
    lastPostAt: string | null;
    postCount30d: number | null;
    totalPostCount: number;
  }[];
  alerts: {
    id: string;
    severity: "info" | "warning" | "critical";
    category: string;
    message: string;
    evidenceRef: string | null;
  }[];
  reports: {
    id: string;
    date: string;
    reportType: "daily" | "weekly" | "monthly";
    track: "ad" | "blog" | "combined";
    title: string;
  }[];
};

const EMPTY: DashboardData = {
  latestDate: null,
  kpi: { activeKeywordCount: 0, avgRank: null, alertCount: 0 },
  adAccountStats: {
    latestDate: null,
    bizmoney: null,
    totals: { impCnt: 0, clkCnt: 0, avgCpc: 0, avgCpm: 0 },
    trend: [],
    range: { since: "", until: "" },
  },
  rankTrend: [],
  keywordTable: [],
  contentMatchedKeywords: [],
  sov: [],
  sovTrend: { keys: [], rows: [] },
  cadence: [],
  alerts: [],
  reports: [],
};

export type AccountStatsRangeOption = { accountStatsSince?: string; accountStatsUntil?: string };

// 이 함수는 캐싱하지 않는다 — keywords/blog 페이지가 공유하는데, blog 페이지는
// competitors 테이블(대시보드에서 경쟁사 추가/삭제로 직접 씀)을 읽어 SOV·포스팅주기를
// 계산한다. 캐싱하면 방금 추가/삭제한 경쟁사가 SOV 차트에 최대 1시간 동안 반영 안
// 되는 문제가 생긴다. latestDate 앵커 조회만 getLatestDataDate()로 위임해 그 부분만
// 캐시 혜택을 받는다.
export async function getDashboardData(
  supabase: Client,
  options?: AccountStatsRangeOption
): Promise<DashboardData> {
  // 두 앵커 날짜 조회는 서로 무관하니 나란히 보낸다(2026-09-17) — 예전엔
  // keyword_daily_metrics 앵커를 받은 뒤에야 ad_account_daily_stats 앵커를
  // 조회해서 왕복이 순서대로 쌓였다(아래 본 쿼리 11개는 원래도 병렬).
  const [latestDate, latestAccountStatsDateRaw] = await Promise.all([
    getLatestDataDate(),
    getLatestAccountStatsDate(supabase),
  ]);
  if (!latestDate) return EMPTY;

  const trendStart = daysBefore(latestDate, TREND_DAYS - 1);
  const latestAccountStatsDate = latestAccountStatsDateRaw ?? latestDate;
  const defaultAccountStatsSince = daysBefore(latestAccountStatsDate, ACCOUNT_STATS_TREND_DAYS - 1);

  const [
    keywordsRes,
    competitorsRes,
    metricsLatestRes,
    metricsTrendRes,
    sovRes,
    cadenceRes,
    blogPostsRes,
    alertsRes,
    reportsRes,
    accountStatsRes,
    latestBizmoneyRes,
  ] = await Promise.all([
    supabase.from("keywords").select("*").eq("is_excluded", false),
    supabase.from("competitors").select("*"),
    supabase.from("keyword_daily_metrics").select("*").eq("date", latestDate),
    supabase
      .from("keyword_daily_metrics")
      .select("date, our_rank")
      .gte("date", trendStart)
      .lte("date", latestDate),
    supabase.from("blog_sov_daily").select("*").gte("date", trendStart).lte("date", latestDate),
    supabase.from("posting_cadence").select("*").eq("date", latestDate),
    // 총 게시물 수는 posting_cadence에 저장된 값이 아니라(스키마에 없음),
    // blog_posts에 지금까지 수집·누적된(url 기준 중복 제거) 전체 건수를 직접 센다.
    // title은 콘텐츠 매칭 키워드 표 계산에도 재사용한다(아래).
    supabase.from("blog_posts").select("competitor_id, title"),
    supabase
      .from("alerts")
      .select("*")
      .eq("date", latestDate)
      .order("severity", { ascending: false }),
    supabase
      .from("daily_reports")
      .select("id, date, report_type, track, title")
      .order("date", { ascending: false })
      .limit(10),
    // 계정 전체 일별 성과지표 — 키워드 데이터의 latestDate와는 별도 파이프라인이라
    // 자체적으로 날짜 범위를 가진다(날짜 앵커를 공유하지 않음). 사용자가 기간을 지정하면
    // 그 범위를, 아니면 실제 수집된 마지막 날짜 기준 최근 N일을 기본값으로 쓴다.
    options?.accountStatsSince && options?.accountStatsUntil
      ? supabase
          .from("ad_account_daily_stats")
          .select("*")
          .gte("date", options.accountStatsSince)
          .lte("date", options.accountStatsUntil)
          .order("date", { ascending: true })
      : supabase
          .from("ad_account_daily_stats")
          .select("*")
          .gte("date", defaultAccountStatsSince)
          .lte("date", latestAccountStatsDate)
          .order("date", { ascending: true }),
    // 비즈머니 잔액은 차트 조회 기간과 무관하게 항상 "가장 최근에 확보된 값"을 보여준다
    // — 과거 기간을 조회 중이어도 지금 남은 잔액을 알고 싶은 것이지, 그 날짜 당시 잔액을
    // 보고 싶은 게 아니다(스냅샷은 파이프라인이 도는 그날 하루치만 채워짐).
    supabase
      .from("ad_account_daily_stats")
      .select("date, bizmoney")
      .not("bizmoney", "is", null)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const keywordMap = new Map((keywordsRes.data ?? []).map((k) => [k.id, k]));
  const competitorMap = new Map((competitorsRes.data ?? []).map((c) => [c.id, c]));

  // KPI: "활성 키워드"는 제외되지 않았고(is_excluded=false) 계정에서 여전히 ELIGIBLE인 것만 센다
  // — 캠페인/광고그룹이 일시중지되면 에이전트가 status를 'REMOVED'로 바꿔주므로 그 값을 그대로 신뢰한다.
  const activeKeywordCount = (keywordsRes.data ?? []).filter((k) => k.status === "ELIGIBLE").length;
  const ranks = (metricsLatestRes.data ?? [])
    .map((m) => m.our_rank)
    .filter((r): r is number => r != null);
  const avgRank = ranks.length
    ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10
    : null;
  const alertCount = (alertsRes.data ?? []).filter(
    (a) => a.severity === "warning" || a.severity === "critical"
  ).length;

  // 14일 순위 추이
  const byDate = new Map<string, number[]>();
  for (const row of metricsTrendRes.data ?? []) {
    if (row.our_rank == null) continue;
    const arr = byDate.get(row.date) ?? [];
    arr.push(row.our_rank);
    byDate.set(row.date, arr);
  }
  const rankTrend: DashboardData["rankTrend"] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = daysBefore(latestDate, i);
    const arr = byDate.get(date);
    rankTrend.push({
      date,
      avgRank: arr?.length
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
        : null,
    });
  }

  // 키워드 상세 테이블 (기본 정렬은 화면에서 처리 — 월간검색수 PC+모바일 내림차순)
  const keywordTable = (metricsLatestRes.data ?? []).map((m) => {
    const kw = keywordMap.get(m.keyword_id);
    return {
      keywordId: m.keyword_id,
      keyword: kw?.keyword ?? "(알 수 없는 키워드)",
      ourRank: m.our_rank,
      avgCpc: m.avg_cpc != null ? Number(m.avg_cpc) : null,
      monthlySearchPc: m.monthly_search_pc,
      monthlySearchMobile: m.monthly_search_mobile,
      monthlyClickPc: m.monthly_click_pc != null ? Number(m.monthly_click_pc) : null,
      monthlyClickMobile: m.monthly_click_mobile != null ? Number(m.monthly_click_mobile) : null,
      competitionLevel: m.competition_level,
      spend7d: m.spend_7d != null ? Number(m.spend_7d) : null,
    };
  });

  // 콘텐츠 매칭 키워드 — 실제 수집된 블로그 게시물 제목에 등장하는 단어와 겹치는 키워드만
  // 골라 상위 20개(제목 매칭 건수 기준). airpass-naver-monitor의 블로그 SOV 검색어 선정
  // 로직(scripts/lib/blog-keyword-scope.ts)과 같은 방식을 대시보드 쪽에서 재현한 것 —
  // 이미 Supabase에 있는 keywords/blog_posts 데이터만으로 계산하므로 별도 동기화가 필요 없다.
  const CONTENT_KEYWORD_DISPLAY_COUNT = 20;
  const postTitles = (blogPostsRes.data ?? [])
    .map((p) => p.title)
    .filter((t): t is string => Boolean(t));
  const contentMatchedKeywords = keywordTable
    .map((k) => ({
      keywordId: k.keywordId,
      keyword: k.keyword,
      monthlySearchPc: k.monthlySearchPc,
      monthlySearchMobile: k.monthlySearchMobile,
      monthlyClickPc: k.monthlyClickPc,
      monthlyClickMobile: k.monthlyClickMobile,
      avgCpc: k.avgCpc,
      matchCount: postTitles.filter((t) => t.includes(k.keyword)).length,
    }))
    .filter((k) => k.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, CONTENT_KEYWORD_DISPLAY_COUNT);

  // 블로그 SOV — 채널별 평균 점유율. 블로그 등록된(blog_id 있는) 채널은 오늘 노출 매칭이
  // 없었더라도 0%로 표시한다 — 매칭된 채널만 보이면 "우리가 몇 곳을 추적 중인지" 알 수 없다.
  // sovRes는 최근 14일치를 한 번에 받아오므로(아래 sovTrend와 공유), 스냅샷 집계는
  // latestDate 하루치 행만 걸러서 쓴다.
  const sovByCompetitor = new Map<string, number[]>();
  for (const row of sovRes.data ?? []) {
    if (row.date !== latestDate) continue;
    const arr = sovByCompetitor.get(row.competitor_id) ?? [];
    arr.push(Number(row.share_pct));
    sovByCompetitor.set(row.competitor_id, arr);
  }
  const blogTrackedCompetitors = (competitorsRes.data ?? []).filter((c) => c.blog_id && c.is_active);
  const sov = blogTrackedCompetitors
    .map((c) => {
      const arr = sovByCompetitor.get(c.id);
      return {
        competitorId: c.id,
        competitorName: c.name,
        sharePct: arr?.length
          ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
          : 0,
      };
    })
    .sort((a, b) => b.sharePct - a.sharePct);

  // SOV 추이 — 경쟁사가 많으면 선이 겹쳐 못 알아보게 되므로, 최신일 기준 상위 6곳만 개별
  // 선으로 그리고 나머지는 "기타 평균" 한 줄로 묶는다.
  const SOV_TREND_TOP_N = 6;
  const sovByDateCompetitor = new Map<string, Map<string, number[]>>();
  for (const row of sovRes.data ?? []) {
    const dateMap = sovByDateCompetitor.get(row.date) ?? new Map<string, number[]>();
    const arr = dateMap.get(row.competitor_id) ?? [];
    arr.push(Number(row.share_pct));
    dateMap.set(row.competitor_id, arr);
    sovByDateCompetitor.set(row.date, dateMap);
  }
  const sovTrendTop = sov.slice(0, SOV_TREND_TOP_N);
  const sovTrendOthers = sov.slice(SOV_TREND_TOP_N);
  const sovTrendKeys = sovTrendTop.map((c) => c.competitorName).concat(sovTrendOthers.length > 0 ? ["기타 평균"] : []);
  const sovTrendDates: string[] = [];
  for (let d = new Date(`${trendStart}T00:00:00Z`); d <= new Date(`${latestDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    sovTrendDates.push(d.toISOString().slice(0, 10));
  }
  const sovTrend = sovTrendDates.map((date) => {
    const dateMap = sovByDateCompetitor.get(date);
    const row: Record<string, number | string> = { date };
    for (const c of sovTrendTop) {
      const arr = dateMap?.get(c.competitorId);
      row[c.competitorName] = arr?.length
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
        : 0;
    }
    if (sovTrendOthers.length > 0) {
      const values = sovTrendOthers.map((c) => {
        const arr = dateMap?.get(c.competitorId);
        return arr?.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      });
      row["기타 평균"] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    }
    return row;
  });

  // 총 게시물 수 — blog_posts에 지금까지 누적 수집된(url 기준 중복 제거) 건수를 채널별로 집계
  const totalPostCountByCompetitor = new Map<string, number>();
  for (const row of blogPostsRes.data ?? []) {
    totalPostCountByCompetitor.set(
      row.competitor_id,
      (totalPostCountByCompetitor.get(row.competitor_id) ?? 0) + 1
    );
  }

  // 포스팅 주기 — 에어패스 자체 블로그를 맨 위로, 나머지는 이름순
  const cadence = (cadenceRes.data ?? [])
    .map((row) => ({
      competitorId: row.competitor_id,
      competitorName: competitorMap.get(row.competitor_id)?.name ?? "(알 수 없는 채널)",
      blogId: competitorMap.get(row.competitor_id)?.blog_id ?? null,
      avgIntervalDays: row.avg_interval_days != null ? Number(row.avg_interval_days) : null,
      lastPostAt: row.last_post_at,
      postCount30d: row.post_count_30d,
      totalPostCount: totalPostCountByCompetitor.get(row.competitor_id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.competitorName === "에어패스") return -1;
      if (b.competitorName === "에어패스") return 1;
      return a.competitorName.localeCompare(b.competitorName);
    });

  const alerts = (alertsRes.data ?? []).map((a) => ({
    id: a.id,
    severity: a.severity,
    category: a.category,
    message: a.message,
    evidenceRef: a.evidence_ref,
  }));

  const reports = (reportsRes.data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    reportType: r.report_type,
    track: r.track,
    title: r.title,
  }));

  // 계정 전체 성과지표 — 최근 N일 오름차순으로 정렬해 차트에 바로 쓸 수 있게 한다.
  const accountStatsRows = [...(accountStatsRes.data ?? [])].sort((a, b) =>
    a.date < b.date ? -1 : 1
  );
  const accountTrend = accountStatsRows.map((r) => ({
    date: r.date,
    impCnt: r.imp_cnt,
    clkCnt: r.clk_cnt,
    cpc: r.cpc != null ? Number(r.cpc) : 0,
    // CPM(노출 1,000회당 비용) = 지출액 / 노출수 * 1000 — 계정 통계 API가 CPM을 직접
    // 주지 않아 이미 갖고 있는 sales_amt/imp_cnt로 계산한다.
    cpm: r.imp_cnt > 0 ? Math.round((Number(r.sales_amt) / r.imp_cnt) * 1000 * 100) / 100 : 0,
  }));
  const accountSums = accountStatsRows.reduce(
    (acc, r) => ({
      impCnt: acc.impCnt + r.imp_cnt,
      clkCnt: acc.clkCnt + r.clk_cnt,
      salesAmt: acc.salesAmt + Number(r.sales_amt),
    }),
    { impCnt: 0, clkCnt: 0, salesAmt: 0 }
  );
  const accountTotals = {
    impCnt: accountSums.impCnt,
    clkCnt: accountSums.clkCnt,
    // 일별 평균을 다시 평균 내면 노출·클릭이 적은 날의 왜곡이 커지므로, 기간 전체
    // 지출액/노출수(클릭수)로 다시 계산한다(진짜 가중평균).
    avgCpc: accountSums.clkCnt > 0 ? Math.round((accountSums.salesAmt / accountSums.clkCnt) * 100) / 100 : 0,
    avgCpm:
      accountSums.impCnt > 0
        ? Math.round((accountSums.salesAmt / accountSums.impCnt) * 1000 * 100) / 100
        : 0,
  };
  const adAccountStats: DashboardData["adAccountStats"] = {
    latestDate: latestBizmoneyRes.data?.date ?? latestAccountStatsDate,
    bizmoney: latestBizmoneyRes.data?.bizmoney != null ? Number(latestBizmoneyRes.data.bizmoney) : null,
    totals: accountTotals,
    trend: accountTrend,
    range: {
      since: options?.accountStatsSince ?? defaultAccountStatsSince,
      until: options?.accountStatsUntil ?? latestAccountStatsDate,
    },
  };

  return {
    latestDate,
    kpi: { activeKeywordCount, avgRank, alertCount },
    adAccountStats,
    rankTrend,
    keywordTable,
    contentMatchedKeywords,
    sov,
    sovTrend: { keys: sovTrendKeys, rows: sovTrend },
    cadence,
    alerts,
    reports,
  };
}
