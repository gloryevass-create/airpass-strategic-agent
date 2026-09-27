-- ============================================================================
-- 네이버블로그 키워드별 검색순위(2026-09-27) — 검색 상위 10위를 통째로 저장한다.
--
-- 왜 필요한가: 기존 blog_sov_daily는 "우리/경쟁사가 상위 10위에 들었을 때"만 행이
-- 생긴다. 실측(2026-09-27) 결과 53개 키워드를 검색해서 우리 7개 블로그가 상위에 든 건
-- 4개뿐이고, 전체 노출 슬롯 300개 중 우리 몫은 2.7%였다. 나머지 97%를 누가 차지하는지는
-- 수집기가 계산에만 쓰고 버려서 어디에도 남지 않았다 — 그래서 "왜 우리가 안 보이는지"를
-- 화면에서 볼 방법이 없었다. 이 테이블이 그 빈칸을 채운다.
--
-- competitor_id를 일부러 저장하지 않는다: blog_id만 넣고 화면에서 competitors.blog_id와
-- 조인해 "추적 대상인지"를 판정한다. 그래야 나중에 새 블로그를 추적 목록에 추가했을 때
-- 과거 순위에도 소급 반영된다(오늘 1위인 낯선 블로그를 발견해 등록하면 지난 기록에서도
-- 추적 대상으로 보인다).
--
-- 권한 모델은 ai_issues(0059)/news_articles와 동일 — authenticated는 읽기만 하고,
-- 쓰기는 service_role(수집기 airpass-naver-monitor)만 한다. 사람이 직접 쓰는 INSERT
-- 정책은 아예 만들지 않는다.
--
-- 규모: 하루 약 530행(검색 키워드 53개 × 상위 10개), 1년 약 19만행.
-- ============================================================================

create table if not exists public.blog_serp_rankings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  -- 검색결과 노출 순서(1부터). 같은 날 같은 키워드 안에서 유일하다.
  rank smallint not null,
  -- blog.naver.com/<blog_id> 의 <blog_id>. 추적 여부와 무관하게 전부 저장한다.
  -- **네이버 블로그가 아니면 null**(티스토리 등) — 실측(2026-09-27) 결과 키워드에 따라
  -- 상위 10개가 전부 티스토리인 경우가 흔하다. 그걸 버리면 "1~10위가 전부 남의 블로그라
  -- 우리가 안 보인다"는 사실 자체가 화면에서 사라지므로 null로라도 남긴다.
  blog_id text,
  -- 검색 API가 주는 블로그 표시 이름(bloggername) — 추적하지 않는 블로그를 사람이
  -- 알아볼 수 있게 하는 유일한 단서라 함께 저장한다.
  blogger_name text,
  post_url text,
  post_title text,
  post_date date,
  collected_at timestamptz not null default now(),
  unique (date, keyword_id, rank)
);

-- 화면은 항상 "특정 날짜의 특정 키워드"를 순위순으로 읽는다.
create index if not exists idx_blog_serp_rankings_lookup
  on public.blog_serp_rankings (date desc, keyword_id, rank);

-- "이 블로그가 어떤 키워드에서 몇 위였나"를 거꾸로 찾을 때(추적 목록에 새로 추가한
-- 블로그의 과거 성적 조회 등).
create index if not exists idx_blog_serp_rankings_blog
  on public.blog_serp_rankings (blog_id, date desc);

alter table public.blog_serp_rankings enable row level security;

create policy "authenticated can select blog serp rankings"
  on public.blog_serp_rankings for select
  using (auth.role() = 'authenticated');
