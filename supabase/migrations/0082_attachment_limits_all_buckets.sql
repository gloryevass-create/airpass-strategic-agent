-- ============================================================================
-- 나머지 첨부파일 버킷에도 크기·형식 상한을 건다(2026-09-29).
--
-- 0081이 journal-attachments에 한 것과 같은 조치를, Memo Board·히스토리
-- (SI Business/Cooperation/Marketing 공용)·제조사 서류 버킷으로 넓힌다 —
-- 같은 날 이 세 화면의 첨부도 **브라우저 → Supabase Storage 직접 업로드**로
-- 바꿨기 때문이다.
--
-- 왜 바꿨나: 파일 바이트를 Server Action에 실어 보내는 경로엔 넘을 수 없는
-- 상한이 둘 있다 — Next.js Server Action 본문 기본 1MB(설정한 적이 없어 계속
-- 기본값이었다)와 Vercel Functions 요청 본문 4.5MB(요금제 무관 하드 리밋).
-- 요청받은 20MB는 그 경로로는 구조적으로 불가능하다.
--
-- 그 대신 서버가 파일 바이트를 보지 못하게 되므로, 서버 액션의 크기·형식
-- 검사는 "브라우저가 알려준 값"을 믿는 안내용이 된다. 실제로 거부하는 주체를
-- 여기 버킷으로 옮겨서, 폼을 거치지 않고 직접 API를 때려도 20MB·허용 형식을
-- 넘지 못하게 한다.
--
-- 권한 자체는 넓어지지 않는다 — 세 버킷 모두 authenticated면 누구나
-- insert/select/delete할 수 있었다(0005/0028/0058의 storage.objects 정책).
-- 지금까지 서버가 그 권한으로 대신 올려주던 걸 브라우저가 직접 할 뿐이고,
-- 오히려 이 마이그레이션으로 그 열린 권한에 크기·형식 제한이 처음 생긴다.
--
-- 20MB는 Supabase 프로젝트 전역 업로드 상한(기본 50MB) 아래라 그대로 적용된다.
-- ============================================================================

-- Memo Board · 히스토리(3개 보드 공용): 이미지·PDF·Office 문서·ZIP
update storage.buckets
set
  file_size_limit = 20971520, -- 20MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed'
  ]
where id in ('memo-attachments', 'history-attachments');

-- 제조사 서류: AI가 사업자등록증·통장사본에서 값을 읽어야 해서 이미지·PDF만.
update storage.buckets
set
  file_size_limit = 20971520, -- 20MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
where id = 'vendor-documents';
