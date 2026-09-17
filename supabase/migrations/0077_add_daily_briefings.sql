-- ============================================================================
-- Today Issue(2026-09-17) — 어제/오늘/내일 브리핑 화면의 AI 요약 문장 저장소.
--
-- 화면에 들어오는 항목 목록 자체는 기존 테이블들을 그때그때 조회해서 만든다
-- (별도 집계 테이블 없음 — 원본이 항상 정답이고, 데이터 규모가 작아 집계를
-- 미리 만들 이유가 없다). 이 테이블은 **AI가 만든 요약 문장만** 담는다.
--
-- ai_issues(0059)와 같은 권한 모델: authenticated는 읽기만, 쓰기는 service_role
-- (크론 라우트의 createAdminClient())만 가능하고 사람이 직접 쓰는 INSERT 정책은
-- 아예 만들지 않는다.
--
-- 하루 3회(08:10·13:10·18:10 KST) 크론이 같은 날 행을 덮어쓰므로 issue_date를
-- 기본키로 둔다 — upsert 한 번으로 "그날의 최신 요약"이 유지된다.
-- ============================================================================

create table if not exists public.daily_briefings (
  -- 한국시간 기준 날짜. 크론이 lib/kstDate.ts::todayKstDateStr()로 직접 채운다
  -- (current_date 기본값을 쓰면 UTC 기준이라 KST 00~09시에 하루 밀린다 —
  -- ai_issues.issue_date에서 실제로 겪은 버그, 0059 주석 참고).
  issue_date date primary key,
  summary text not null,
  -- 어느 모델이 만든 문장인지(나중에 모델을 바꿨을 때 품질 비교용).
  model text,
  -- 화면에 "○○시 생성"으로 함께 표시한다 — 요약은 스냅샷이라 마지막 갱신
  -- 시각을 같이 보여주지 않으면 오후에 보는 사람이 오해한다.
  generated_at timestamptz not null default now()
);

alter table public.daily_briefings enable row level security;

create policy "authenticated can select daily briefings"
  on public.daily_briefings for select
  using (auth.role() = 'authenticated');
