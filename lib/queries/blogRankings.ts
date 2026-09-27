import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Client = SupabaseClient<Database>;

/** 네이버블로그 키워드별 검색순위(2026-09-27).
 *
 * 기존 SOV는 "우리/경쟁사가 상위 10위에 들었을 때"만 행이 생겨서, 대부분의 키워드는
 * 화면에서 아예 보이지 않았다(실측: 53개 키워드 중 4개만 데이터 생성, 전체 노출
 * 슬롯의 2.7%). 이 파일은 `blog_serp_rankings`(0078)에 통째로 저장한 상위 10위를 읽어
 * "이 키워드는 누가 차지하고 있고 우리는 몇 위인가"를 그대로 보여준다.
 *
 * 추적 여부(`competitors.blog_id`)는 저장된 값이 아니라 **조회 시점에 조인해서** 판정한다
 * — 그래야 새 블로그를 추적 목록에 추가하면 과거 순위에도 소급 반영된다(0078 주석 참고). */

export type RankedKeyword = {
  keywordId: string;
  keyword: string;
  /** 추적 중인 블로그가 이 키워드에서 올린 가장 높은 순위. 하나도 없으면 null(미노출). */
  bestTrackedRank: number | null;
  /** 그 순위를 차지한 블로그 이름(우리 것이든 경쟁사든). */
  bestTrackedName: string | null;
  /** 상위 10위 안에 든 추적 블로그 수(중복 노출 포함). */
  trackedCount: number;
};

export type RankingRow = {
  rank: number;
  blogId: string | null;
  /** 추적 목록에 있으면 등록된 이름, 없으면 검색 API가 준 블로그 표시 이름. */
  displayName: string;
  /** 추적 중인 블로그면 그 이름 — 화면에서 행을 강조할지 판단하는 값. */
  trackedName: string | null;
  postTitle: string | null;
  postUrl: string | null;
  postDate: string | null;
};

export type KeywordRanking = {
  keywordId: string;
  keyword: string;
  date: string;
  rows: RankingRow[];
};

/** 순위 데이터가 존재하는 가장 최근 날짜. 없으면 null(아직 수집 전). */
export async function getLatestRankingDate(supabase: Client): Promise<string | null> {
  const { data, error } = await supabase
    .from("blog_serp_rankings")
    .select("date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  // 마이그레이션 0078 적용 전이면 테이블이 없어 에러가 난다 — 화면은 순위 섹션만
  // 비운 채로 정상 동작해야 하므로 조용히 null을 돌려준다.
  if (error) return null;
  return data?.date ?? null;
}

/** 그날 검색된 키워드 목록 + 각 키워드에서 우리(추적 블로그)의 최고 순위.
 * 목록은 **우리 순위가 좋은 키워드부터** 정렬한다 — 성과가 있는 키워드를 먼저 보게. */
export async function getRankedKeywords(supabase: Client, date: string): Promise<RankedKeyword[]> {
  const [{ data: rows, error }, { data: competitors }] = await Promise.all([
    supabase.from("blog_serp_rankings").select("keyword_id, rank, blog_id").eq("date", date),
    supabase.from("competitors").select("name, blog_id").eq("is_active", true),
  ]);
  if (error || !rows) return [];

  const trackedByBlogId = new Map(
    (competitors ?? []).filter((c) => c.blog_id).map((c) => [c.blog_id as string, c.name])
  );

  const keywordIds = Array.from(new Set(rows.map((r) => r.keyword_id)));
  if (keywordIds.length === 0) return [];
  const { data: keywords } = await supabase.from("keywords").select("id, keyword").in("id", keywordIds);
  const keywordName = new Map((keywords ?? []).map((k) => [k.id, k.keyword]));

  const byKeyword = new Map<string, { rank: number; name: string }[]>();
  for (const r of rows) {
    const name = r.blog_id ? trackedByBlogId.get(r.blog_id) : undefined;
    if (!name) continue;
    byKeyword.set(r.keyword_id, [...(byKeyword.get(r.keyword_id) ?? []), { rank: r.rank, name }]);
  }

  return keywordIds
    .map((id) => {
      const hits = (byKeyword.get(id) ?? []).sort((a, b) => a.rank - b.rank);
      return {
        keywordId: id,
        keyword: keywordName.get(id) ?? "(알 수 없는 키워드)",
        bestTrackedRank: hits[0]?.rank ?? null,
        bestTrackedName: hits[0]?.name ?? null,
        trackedCount: hits.length,
      };
    })
    .sort((a, b) => {
      // 노출된 키워드가 먼저(순위 오름차순), 미노출은 뒤로 보내고 이름순.
      if (a.bestTrackedRank == null && b.bestTrackedRank == null) return a.keyword.localeCompare(b.keyword);
      if (a.bestTrackedRank == null) return 1;
      if (b.bestTrackedRank == null) return -1;
      return a.bestTrackedRank - b.bestTrackedRank;
    });
}

/** 키워드 하나의 상위 10위 전체. 추적하지 않는 블로그도 그대로 포함한다. */
export async function getKeywordRanking(
  supabase: Client,
  date: string,
  keywordId: string
): Promise<KeywordRanking | null> {
  const [{ data: rows, error }, { data: competitors }, { data: keyword }] = await Promise.all([
    supabase
      .from("blog_serp_rankings")
      .select("rank, blog_id, blogger_name, post_title, post_url, post_date")
      .eq("date", date)
      .eq("keyword_id", keywordId)
      .order("rank", { ascending: true }),
    supabase.from("competitors").select("name, blog_id").eq("is_active", true),
    supabase.from("keywords").select("keyword").eq("id", keywordId).maybeSingle(),
  ]);
  if (error || !rows || rows.length === 0) return null;

  const trackedByBlogId = new Map(
    (competitors ?? []).filter((c) => c.blog_id).map((c) => [c.blog_id as string, c.name])
  );

  return {
    keywordId,
    keyword: keyword?.keyword ?? "(알 수 없는 키워드)",
    date,
    rows: rows.map((r) => {
      const trackedName = r.blog_id ? (trackedByBlogId.get(r.blog_id) ?? null) : null;
      return {
        rank: r.rank,
        blogId: r.blog_id,
        // 추적 목록의 이름을 우선 쓰고(우리가 부르는 이름), 없으면 검색 API의 표시 이름,
        // 그것도 없으면 블로그 ID. 셋 다 없는 경우는 "(이름 없음)".
        displayName: trackedName ?? r.blogger_name ?? r.blog_id ?? "(이름 없음)",
        trackedName,
        postTitle: r.post_title,
        postUrl: r.post_url,
        postDate: r.post_date,
      };
    }),
  };
}
