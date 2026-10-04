-- ============================================================================
-- Work Journal: 작성자 본인과 관리자만 수정·삭제할 수 있게 한다(2026-10-04).
--
-- 지금까지 work_journal_entries는 authenticated면 **누구나** update/delete할 수
-- 있었다(0042). Memo Board(0006/0007)·Meeting Notes(0056)·AI Review/AI Tools(0059)는
-- 전부 "author_id = auth.uid() or is_admin()"으로 막혀 있었는데 업무일지만 빠져
-- 있었다 — 작성자를 화면에 표기하는 메뉴는 같은 규칙을 따라야 한다(사용자 요청).
--
-- ⚠️ 업무일지에는 작성자 **컬럼 자체가 없었다**. author_name은 폼의 드롭다운에서
-- 고르는 자유 텍스트라 "누가 이 행을 만들었는지"가 아니라 "누구의 업무인지"다
-- (다른 팀원 몫으로 대신 기록하는 경우가 있어 그렇게 만들었다, 0042 참고).
-- 그래서 실제 작성자를 담을 author_id를 새로 추가한다.
--
-- 기존 16건은 author_id가 없으므로 author_name ↔ profiles.name으로 메운다.
-- 사전 확인(2026-10-04): 쓰이는 이름은 "박준찬"(13건)·"정윤강"(3건) 두 개뿐이고
-- 둘 다 profiles에 정확히 일치하며, profiles.name에 중복이 없다. 혹시 매칭되지
-- 않는 행이 남으면 author_id가 null로 남아 관리자만 수정할 수 있게 된다
-- (아무나 고칠 수 있는 지금 상태보다 안전한 쪽으로 실패한다).
-- ============================================================================

alter table public.work_journal_entries
  add column if not exists author_id uuid references auth.users (id) on delete set null;

update public.work_journal_entries e
set author_id = p.id
from public.profiles p
where e.author_id is null
  and e.author_name = p.name;

create index if not exists idx_work_journal_entries_author
  on public.work_journal_entries (author_id);

-- ── 일지 본문 ────────────────────────────────────────────────────────────
drop policy if exists "authenticated can update work journal entries" on public.work_journal_entries;
drop policy if exists "authenticated can delete work journal entries" on public.work_journal_entries;

create policy "author or admin can update work journal entries"
  on public.work_journal_entries for update
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "author or admin can delete work journal entries"
  on public.work_journal_entries for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

-- ── 첨부파일 ─────────────────────────────────────────────────────────────
-- 첨부는 자기 권한을 따로 갖지 않고 **상위 일지의 권한을 그대로 따른다** —
-- 남의 일지에 파일을 붙이거나 떼어낼 수 있으면 본문만 막아둔 의미가 없다.
-- (일지를 지울 때의 cascade delete는 RLS를 거치지 않으므로 이 정책의 영향을
-- 받지 않는다 — 일지를 지울 수 있는 사람은 그 첨부도 함께 지울 수 있다.)
drop policy if exists "authenticated can insert work journal attachments" on public.work_journal_attachments;
drop policy if exists "authenticated can delete work journal attachments" on public.work_journal_attachments;

create policy "author or admin can insert work journal attachments"
  on public.work_journal_attachments for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.work_journal_entries e
      where e.id = entry_id
        and (e.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

create policy "author or admin can delete work journal attachments"
  on public.work_journal_attachments for delete
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.work_journal_entries e
      where e.id = entry_id
        and (e.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );
