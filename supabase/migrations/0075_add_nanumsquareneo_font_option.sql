-- ============================================================================
-- profiles.font_preference/sidebar_font_preference에 'nanumsquareneo'(나눔스퀘어 네오)
-- 선택지 추가(2026-09-13). 0061~0066과 같은 이유로 두 check 제약 모두 지우고
-- 다시 만든다.
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_font_preference_check;
alter table public.profiles
  add constraint profiles_font_preference_check
  check (font_preference in ('pretendard', 'system', 'gmarket', 'nanumsquare', 'noto', 'omudaye', 'lineseed', 'nanumsquareneo'));

alter table public.profiles drop constraint if exists profiles_sidebar_font_preference_check;
alter table public.profiles
  add constraint profiles_sidebar_font_preference_check
  check (sidebar_font_preference in ('pretendard', 'system', 'gmarket', 'nanumsquare', 'noto', 'omudaye', 'lineseed', 'nanumsquareneo'));
