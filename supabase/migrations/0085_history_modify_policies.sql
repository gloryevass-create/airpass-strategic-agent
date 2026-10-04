-- ============================================================================
-- 히스토리: 작성자 본인과 관리자가 수정·삭제할 수 있게 한다(2026-10-04).
--
-- 그동안 히스토리는 "기록 자체가 사라지는 것을 막기 위해" 삭제 기능을 두지
-- 않았고(0032/0037/0038 주석), 수정은 작성자 본인만 가능했다(관리자도 불가).
-- 사용자 요청으로 이 방침을 바꾼다 — 본인과 관리자가 수정·삭제 모두 할 수 있다.
--
-- 첨부파일 테이블은 자기 권한을 따로 갖지 않고 **상위 히스토리의 권한을 따른다**
-- (Work Journal 0083과 같은 방식) — 본문만 막고 첨부를 열어두면 남의 기록에서
-- 파일만 떼어낼 수 있다. 히스토리 행을 지울 때의 cascade는 RLS를 거치지 않으므로
-- 이 정책의 영향을 받지 않는다.
-- ============================================================================

-- ── business_projects_v2_history ──
drop policy if exists "authenticated can update own business project history" on public.business_projects_v2_history;
create policy "author or admin can update business project v2 history"
  on public.business_projects_v2_history for update
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "author or admin can delete business project v2 history"
  on public.business_projects_v2_history for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists "authenticated can insert business history attachments" on public.business_projects_v2_history_attachments;
drop policy if exists "authenticated can delete business history attachments" on public.business_projects_v2_history_attachments;

create policy "author or admin can insert business history attachments"
  on public.business_projects_v2_history_attachments for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.business_projects_v2_history h
      where h.id = history_id
        and (h.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

create policy "author or admin can delete business history attachments"
  on public.business_projects_v2_history_attachments for delete
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.business_projects_v2_history h
      where h.id = history_id
        and (h.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

-- ── cooperation_projects_history ──
drop policy if exists "authenticated can update own cooperation project history" on public.cooperation_projects_history;
create policy "author or admin can update cooperation project history"
  on public.cooperation_projects_history for update
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "author or admin can delete cooperation project history"
  on public.cooperation_projects_history for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists "authenticated can insert cooperation history attachments" on public.cooperation_projects_history_attachments;
drop policy if exists "authenticated can delete cooperation history attachments" on public.cooperation_projects_history_attachments;

create policy "author or admin can insert cooperation history attachments"
  on public.cooperation_projects_history_attachments for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.cooperation_projects_history h
      where h.id = history_id
        and (h.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

create policy "author or admin can delete cooperation history attachments"
  on public.cooperation_projects_history_attachments for delete
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.cooperation_projects_history h
      where h.id = history_id
        and (h.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

-- ── marketing_tasks_history ──
drop policy if exists "authenticated can update own marketing task history" on public.marketing_tasks_history;
create policy "author or admin can update marketing task history"
  on public.marketing_tasks_history for update
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

create policy "author or admin can delete marketing task history"
  on public.marketing_tasks_history for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists "authenticated can insert marketing history attachments" on public.marketing_tasks_history_attachments;
drop policy if exists "authenticated can delete marketing history attachments" on public.marketing_tasks_history_attachments;

create policy "author or admin can insert marketing history attachments"
  on public.marketing_tasks_history_attachments for insert
  with check (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.marketing_tasks_history h
      where h.id = history_id
        and (h.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

create policy "author or admin can delete marketing history attachments"
  on public.marketing_tasks_history_attachments for delete
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.marketing_tasks_history h
      where h.id = history_id
        and (h.author_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );
