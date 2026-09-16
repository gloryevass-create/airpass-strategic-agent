-- ============================================================================
-- AI Tools·Work Journal·자료메일발송도 새 항목 등록 시 팀 알림 피드에 남긴다
-- (사용자 확인, 2026-09-16) — 워크스페이스 메뉴 중 알림이 빠져있던 곳을
-- 점검하다가 발견. Business/Cooperation/Marketing(0039)과 같은 방식으로
-- notifications_type_check에 새 타입 3개를 추가한다.
-- ============================================================================

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'event', 'business', 'youtube', 'budget_low', 'memo', 'budget_scrap', 'prespec_scrap',
      'news_scrap', 'cooperation', 'marketing', 'quotation', 'meeting_note', 'ai_review',
      'ai_tool', 'work_journal', 'material_email'
    )
  );
