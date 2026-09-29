-- ============================================================================
-- Work Journal 첨부파일: 버킷 자체에 크기·형식 상한을 건다(2026-09-29).
--
-- 왜 필요한가: 이 날부터 Work Journal 첨부파일은 **브라우저가 Supabase Storage로
-- 직접 업로드**한다(서버 액션을 거치지 않는다). 그렇게 바꾼 이유는 서버 액션
-- 경로에 넘을 수 없는 상한이 둘 있기 때문이다 —
--   ① Next.js Server Action 본문 기본 1MB(이 프로젝트는 설정한 적이 없었다)
--   ② Vercel Functions 요청 본문 4.5MB(플랜 무관 플랫폼 하드 리밋)
-- 요청받은 20MB 첨부는 그 경로로는 구조적으로 불가능하다.
--
-- 그 대신 서버가 파일 바이트를 보지 못하게 되므로, 서버 액션의 크기·형식 검사는
-- "브라우저가 알려준 값"을 믿는 안내용이 된다. 실제로 거부하는 주체를 여기
-- 버킷으로 옮겨서, 폼을 거치지 않고 직접 API를 때려도 20MB·허용 형식을 넘지
-- 못하게 한다.
--
-- 권한 자체는 넓어지지 않는다 — 0042부터 journal-attachments 버킷은
-- authenticated면 누구나 insert/select/delete할 수 있었고(storage.objects 정책),
-- 지금까지 서버가 그 권한으로 대신 올려주던 걸 브라우저가 직접 하는 것뿐이다.
-- 오히려 이 마이그레이션으로 그 열린 권한에 크기·형식 제한이 처음 생긴다.
--
-- 20MB는 Supabase 프로젝트 전역 업로드 상한(기본 50MB) 아래라 그대로 적용된다.
-- 더 올리려면 Storage 설정의 전역 상한도 함께 확인해야 한다.
-- ============================================================================

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
where id = 'journal-attachments';
