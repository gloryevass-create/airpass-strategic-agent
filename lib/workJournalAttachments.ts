/** Work Journal 첨부파일 제약 — 브라우저(업로드 전 검증)와 서버(DB 저장 전 검증)가
 * 반드시 같은 값을 보도록 한 곳에 모아둔다. 이 파일은 클라이언트 번들에도
 * 들어가므로 node 전용 모듈(node:crypto 등)을 import하면 안 된다.
 *
 * ⚠️ 이 상수는 "안내·UX용"이다. 진짜 강제는 Supabase Storage 버킷 자체의
 * file_size_limit/allowed_mime_types가 한다(마이그레이션 0081) — 2026-09-29부터
 * 브라우저가 Storage로 직접 업로드하므로, 서버가 파일 바이트를 보지 못해
 * 여기서 검사하는 건 클라이언트가 보내준 메타데이터뿐이기 때문이다.
 * (그 버킷은 원래부터 authenticated면 누구나 직접 쓸 수 있었으므로 이 구조가
 * 권한을 새로 넓히지는 않는다 — 0042의 storage.objects 정책 참고.) */

export const WORK_JOURNAL_BUCKET = "journal-attachments";

export const WORK_JOURNAL_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
];

/** 2026-09-29에 12MB → 20MB(사용자 요청). 이 값을 올리려면 마이그레이션 0081의
 * 버킷 file_size_limit도 함께 올려야 한다 — 그쪽이 실제로 거부하는 쪽이다. */
export const WORK_JOURNAL_MAX_SIZE = 20 * 1024 * 1024;
export const WORK_JOURNAL_MAX_COUNT = 5;

export const WORK_JOURNAL_ATTACHMENT_HINT = `이미지·PDF·Office 문서·ZIP, 파일당 20MB 이하, 일지당 최대 ${WORK_JOURNAL_MAX_COUNT}개`;

/** 브라우저가 업로드를 마친 뒤 서버 액션에 넘기는 값(파일 바이트가 아니라 위치만). */
export type UploadedAttachment = {
  /** journal-attachments 버킷 안의 오브젝트 키 */
  path: string;
  /** 사람이 보는 원본 파일명 — Storage 키에는 한글을 쓸 수 없어 DB에만 남는다 */
  fileName: string;
  contentType: string;
  size: number;
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type FileLike = { name: string; type: string; size: number };

/** 파일 하나가 규칙에 맞는지. 맞으면 null, 아니면 사용자에게 보여줄 문구. */
export function validateAttachmentFile(file: FileLike): string | null {
  if (!WORK_JOURNAL_ALLOWED_TYPES.includes(file.type)) {
    return `${file.name}: 이미지·PDF·Office 문서·ZIP 파일만 올릴 수 있습니다.`;
  }
  if (file.size > WORK_JOURNAL_MAX_SIZE) {
    return `${file.name}: 파일은 20MB 이하만 올릴 수 있습니다(${formatFileSize(file.size)}).`;
  }
  return null;
}

/** 개수 상한은 "이미 붙어 있는 첨부 + 이번에 추가하는 것"을 합쳐서 본다 —
 * 수정 화면에서 기존 4개에 3개를 더 붙이는 걸 막기 위함. */
export function validateAttachmentFiles(files: FileLike[], existingCount = 0): string | null {
  if (existingCount + files.length > WORK_JOURNAL_MAX_COUNT) {
    return `첨부파일은 일지당 최대 ${WORK_JOURNAL_MAX_COUNT}개까지입니다(현재 ${existingCount}개 + 추가 ${files.length}개).`;
  }
  for (const file of files) {
    const error = validateAttachmentFile(file);
    if (error) return error;
  }
  return null;
}
