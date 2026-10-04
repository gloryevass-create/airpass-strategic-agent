-- ============================================================================
-- 댓글 삭제: 작성자 본인과 관리자만(2026-10-04).
--
-- 여섯 개 댓글 테이블이 구조는 같은데 삭제 정책이 셋으로 갈려 있었다.
--   · Memo Board / Meeting Notes / AI Review — authenticated면 **누구나** 삭제
--     (0005/0057/0059). 다만 삭제 기능이 화면에도 서버에도 없어서 실제로 지울
--     방법은 없었고, 이 정책은 원글 삭제 시 cascade를 막지 않으려고 열어둔
--     것이었다. 이번에 삭제 기능을 추가하므로 그대로 두면 남의 댓글을 지울 수
--     있게 된다.
--   · SI Business / Cooperation / Marketing — 작성자 본인만(0031/0037/0038).
--     관리자가 부적절한 댓글을 치울 수 없었다.
-- 전부 "작성자 본인 또는 관리자"로 통일한다(사용자 요청).
--
-- ※ cascade delete는 RLS를 거치지 않으므로, 원글을 지울 수 있는 사람은 그 글의
--    댓글도 함께 지울 수 있다 — 이 정책을 조여도 cascade는 그대로 동작한다.
-- ============================================================================

-- ── Memo Board / Meeting Notes / AI Review: 누구나 → 작성자+관리자 ──────────
drop policy if exists "authenticated can delete comments" on public.ad_strategy_memo_comments;
create policy "author or admin can delete memo comments"
  on public.ad_strategy_memo_comments for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists "authenticated can delete meeting note comments" on public.meeting_note_comments;
create policy "author or admin can delete meeting note comments"
  on public.meeting_note_comments for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists "authenticated can delete ai review comments" on public.ai_review_comments;
create policy "author or admin can delete ai review comments"
  on public.ai_review_comments for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

-- ── 세 보드: 작성자만 → 작성자+관리자 ───────────────────────────────────────
drop policy if exists "authenticated can delete own business project comments" on public.business_projects_v2_comments;
create policy "author or admin can delete business project v2 comments"
  on public.business_projects_v2_comments for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists "authenticated can delete own cooperation project comments" on public.cooperation_projects_comments;
create policy "author or admin can delete cooperation project comments"
  on public.cooperation_projects_comments for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists "authenticated can delete own marketing task comments" on public.marketing_tasks_comments;
create policy "author or admin can delete marketing task comments"
  on public.marketing_tasks_comments for delete
  using (
    auth.role() = 'authenticated'
    and (author_id = auth.uid() or public.is_admin(auth.uid()))
  );
