-- ============================================================================
-- team_member_names 뷰를 SECURITY DEFINER 함수로 교체(2026-09-27).
--
-- 왜: Supabase Advisor가 `public.team_member_names` 뷰를 "Security Definer View"
-- CRITICAL로 표시했다. 뷰가 생성자 권한으로 돌아 기반 테이블(profiles)의 RLS를
-- 우회하기 때문이다 — 지금 내보내는 건 id/name 둘뿐이라 실제 노출은 좁지만,
-- 나중에 이 뷰에 컬럼이 추가되면 그대로 새어 나가는 패턴이라 경고 자체는 정당하다.
--
-- 0067(뷰를 만든 이유)은 그대로 유효하다: profiles의 select RLS가 "본인 행 또는
-- 관리자만 전체"라, 일반 팀원이 담당자 선택 목록을 열면 본인 이름 하나만 보이는
-- 버그가 있었다. profiles의 RLS를 전체 열람으로 넓히면 이메일·핸드폰·구글메일·
-- 최근 로그인 IP까지 팀 전체에 노출되므로 그 방향은 택하지 않는다.
--
-- 그래서 우회를 없애는 게 아니라 **공인된 방식으로 감싼다**: 이름만 돌려주는
-- security definer 함수로 바꾼다. 노출 범위는 뷰와 완전히 동일하고(전 직원의
-- 이름), Advisor의 "Security Definer View" 항목에서는 빠진다.
--
-- ⚠️ `security_invoker = true` 뷰로 바꾸는 흔한 처방은 여기서 쓰면 안 된다 —
-- 조회자 권한으로 돌아 0067이 고친 버그가 되살아난다.
--
-- search_path를 빈 문자열로 고정한다(Supabase의 "Function Search Path Mutable"
-- 권고) — 그래서 함수 안의 모든 참조를 public.으로 완전히 적는다.
-- ============================================================================

drop view if exists public.team_member_names;

create or replace function public.team_member_names()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name
  from public.profiles p
  where p.name is not null
  order by p.name;
$$;

-- 로그인한 팀원 누구나 호출할 수 있다(담당자 선택 목록이 모든 보드에서 쓰인다).
-- 익명 사용자에게는 주지 않는다.
revoke all on function public.team_member_names() from public, anon;
grant execute on function public.team_member_names() to authenticated;
