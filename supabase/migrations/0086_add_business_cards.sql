-- ============================================================================
-- 리멤버 명함첩(2026-10-11) — 각자 리멤버에서 내려받은 CSV를 올려 자기 명함만
-- 보는 개인 데이터다.
--
-- 권한 모델은 팀 공유가 아니라 **To-Do(0068)와 같은 완전 개인 소유**다 —
-- owner_id = auth.uid()만 허용하고 관리자 우회 정책도 두지 않는다. 명함첩에는
-- 외부인의 이름·휴대폰·이메일·주소가 들어 있어(실제 업로드분 1,166건) 팀 전체에
-- 열어둘 성격의 데이터가 아니고, 사용자도 "각 멤버별로 각각 업로드해 관리"를
-- 요청했다. 관리자도 남의 명함첩은 볼 수 없다.
--
-- 컬럼은 리멤버 CSV 내보내기 헤더를 그대로 1:1 대응시켰다(실측 헤더 13개):
--   회사·이름·부서·직함·전자 메일 주소·근무지 주소 번지·근무처 전화·근무처 팩스·
--   휴대폰·명함 등록일·명함첩 이름·그룹·메모
-- "메모"는 업로드분 1,166건 전부 비어 있었지만 리멤버가 내보내는 칸이라 받아둔다.
--
-- dedup_key: 같은 CSV를 다시 올려도 중복이 쌓이지 않게 하는 키다. 앱이
-- "이름|회사|휴대폰"을 공백 제거·소문자화해 만들고 upsert한다. 실측 1,166건
-- 중 이 키가 겹치는 행이 1건 있어 업로드하면 1,165건이 된다 — 같은 사람의
-- 명함을 두 장 보관하는 경우를 잃지만, 재업로드할 때마다 1,000건씩 불어나는
-- 쪽이 훨씬 나쁘다고 판단했다.
-- ============================================================================

create table if not exists public.business_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company text,
  name text not null,
  department text,
  title text,
  email text,
  address text,
  work_phone text,
  work_fax text,
  mobile text,
  -- 리멤버는 "2026년 10월 11일" 형식으로 내보낸다 — 앱이 date로 파싱해 넣는다.
  registered_on date,
  card_book text,
  group_name text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dedup_key text not null,
  unique (owner_id, dedup_key)
);

-- 목록은 항상 "내 것"을 이름순으로 본다.
create index if not exists idx_business_cards_owner
  on public.business_cards (owner_id, name);
-- 그룹 필터용.
create index if not exists idx_business_cards_group
  on public.business_cards (owner_id, group_name);

alter table public.business_cards enable row level security;

create policy "owner can select own business cards"
  on public.business_cards for select
  using (auth.role() = 'authenticated' and owner_id = auth.uid());

create policy "owner can insert own business cards"
  on public.business_cards for insert
  with check (auth.role() = 'authenticated' and owner_id = auth.uid());

create policy "owner can update own business cards"
  on public.business_cards for update
  using (auth.role() = 'authenticated' and owner_id = auth.uid());

create policy "owner can delete own business cards"
  on public.business_cards for delete
  using (auth.role() = 'authenticated' and owner_id = auth.uid());
