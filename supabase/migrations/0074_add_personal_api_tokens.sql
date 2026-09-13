-- ============================================================================
-- 개인 API 토큰(2026-09-13) — Claude 등 외부 에이전트가 본인 일정(개인 구글
-- 캘린더 + 팀 캘린더 team_events_v2)을 읽어가 브리핑에 쓸 수 있게, Bearer
-- 토큰으로 인증하는 공개 API(app/api/calendar-feed/route.ts)를 추가하면서
-- 함께 만든 테이블.
--
-- google_calendar_connections(0050)/material_email_smtp_accounts(0070)와 같은
-- 이유로 admin(service_role) 클라이언트 없이 세션 클라이언트 + self-row RLS로
-- 바로 CRUD한다 — 자기 토큰을 자기가 발급/삭제해도 권한상승 위험이 없다.
--
-- 토큰 자체는 평문 저장하지 않는다 — 이 값은 Authorization 헤더로 그대로
-- 흘러들어와 "알면 그 사람 행세를 할 수 있는" 값이라(SMTP 비밀번호나 OAuth
-- refresh_token보다 유출 시 위험도가 크다고 판단) sha256 해시(token_hash)만
-- 저장하고, 발급 시 평문은 응답으로 딱 한 번만 내려준다. 조회용으로는
-- token_preview(예: "aps_3f9a2b...c2d1")만 남긴다.
--
-- 검증(app/api/calendar-feed/route.ts)은 세션이 없는 서버-투-서버 호출이라
-- admin(service_role) 클라이언트로 token_hash를 조회해 user_id를 알아낸다 —
-- RLS(본인 행만 select)로는 애초에 이 조회 자체가 불가능하므로 admin 클라이언트가
-- 유일한 방법이다(다른 곳의 cron 라우트가 CRON_SECRET 검증 후 admin 클라이언트를
-- 쓰는 것과 같은 구조).
-- ============================================================================

create table if not exists public.personal_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  token_hash text not null unique,
  token_preview text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.personal_api_tokens enable row level security;

create policy "select own personal api tokens"
  on public.personal_api_tokens for select
  using (user_id = auth.uid());

create policy "insert own personal api tokens"
  on public.personal_api_tokens for insert
  with check (user_id = auth.uid());

create policy "delete own personal api tokens"
  on public.personal_api_tokens for delete
  using (user_id = auth.uid());
