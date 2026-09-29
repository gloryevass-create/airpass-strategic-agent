/** 첨부파일 정책 — 브라우저(업로드 전 검증)와 서버(DB 저장 전 검증)가 반드시
 * 같은 값을 보도록 한 곳에 모은다. 클라이언트 번들에도 들어가므로 node 전용
 * 모듈(node:crypto 등)을 import하면 안 된다.
 *
 * ── 왜 이 파일이 생겼나 (2026-09-29) ──────────────────────────────────
 * 원래 모든 첨부파일은 파일 바이트를 Server Action에 실어 보냈는데, 그 경로엔
 * 넘을 수 없는 상한이 둘 있다.
 *   ① Next.js Server Action 본문 기본 1MB — 이 프로젝트는 설정한 적이 없어
 *      계속 기본값이었다. 화면엔 "12MB 이하"라고 적혀 있었지만 사진 두 장이면
 *      합계가 1MB를 넘어 통째로 실패했다(사용자 제보 "파일 하나만 됨"의 원인).
 *   ② Vercel Functions 요청 본문 4.5MB — 요금제와 무관한 플랫폼 하드 리밋.
 * 그래서 20MB 첨부는 서버 경유로는 구조적으로 불가능하다. 지금은 브라우저가
 * Supabase Storage로 **직접** 올리고(lib/attachmentUpload.ts) 서버 액션에는
 * 올라간 위치(경로 문자열)만 넘긴다 — Vercel을 아예 거치지 않는다.
 *
 * ⚠️ 그래서 서버가 파일 바이트를 못 본다. 여기 있는 크기·형식 검사는 브라우저가
 * 알려준 메타데이터에 대한 것이고, **실제로 거부하는 주체는 Storage 버킷 자체의
 * file_size_limit/allowed_mime_types**다(마이그레이션 0081·0082). 네 버킷 모두
 * 원래부터 authenticated면 누구나 insert/select/delete할 수 있었으므로
 * (0005/0028/0042/0058) 이 구조가 권한을 새로 넓히지는 않는다 — 오히려 그
 * 열린 권한에 크기·형식 제한이 처음 생겼다.
 *
 * ⚠️ 구글드라이브 업로드 분기는 이 경로에 없다 — 브라우저가 회사 드라이브
 * 자격증명을 가질 수 없기 때문. 신규 첨부는 항상 Supabase Storage로 간다
 * (GOOGLE_DRIVE_ATTACHMENTS_ROOT_FOLDER_ID는 2026-09-07부터 비어 있어 현재
 * 동작 차이는 없고, 이미 드라이브에 있는 기존 첨부는 그대로 열람·삭제된다). */

export const DOCUMENT_MIME_TYPES = [
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

/** 제조사 서류는 AI가 사업자등록증·통장사본에서 값을 읽어야 해서 이미지/PDF만 받는다. */
export const VENDOR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024;

export type AttachmentServiceKey = "journal" | "memo" | "history" | "vendor";

type Policy = {
  bucket: string;
  maxCount: number;
  allowedTypes: string[];
  typeLabel: string;
};

/** maxCount/bucket을 바꾸면 해당 버킷의 마이그레이션(0081·0082)도 함께 봐야 한다. */
export const ATTACHMENT_POLICY: Record<AttachmentServiceKey, Policy> = {
  journal: { bucket: "journal-attachments", maxCount: 5, allowedTypes: DOCUMENT_MIME_TYPES, typeLabel: "이미지·PDF·Office 문서·ZIP" },
  memo: { bucket: "memo-attachments", maxCount: 5, allowedTypes: DOCUMENT_MIME_TYPES, typeLabel: "이미지·PDF·Office 문서·ZIP" },
  history: { bucket: "history-attachments", maxCount: 5, allowedTypes: DOCUMENT_MIME_TYPES, typeLabel: "이미지·PDF·Office 문서·ZIP" },
  vendor: { bucket: "vendor-documents", maxCount: 1, allowedTypes: VENDOR_MIME_TYPES, typeLabel: "JPG·PNG·WebP·PDF" },
};

export function attachmentHint(service: AttachmentServiceKey): string {
  const p = ATTACHMENT_POLICY[service];
  const count = p.maxCount > 1 ? `, 최대 ${p.maxCount}개` : "";
  return `${p.typeLabel}, 파일당 20MB 이하${count}`;
}

/** 브라우저가 업로드를 마친 뒤 서버 액션에 넘기는 값(파일 바이트가 아니라 위치만). */
export type UploadedAttachment = {
  /** 버킷 안의 오브젝트 키 */
  path: string;
  /** 사람이 보는 원본 파일명 — Storage 키에는 한글을 쓸 수 없어 DB에만 남는다 */
  fileName: string;
  contentType: string;
  size: number;
};

/** 서버 액션이 FormData에서 업로드 결과를 읽을 때 쓰는 필드명. */
export const UPLOADED_ATTACHMENTS_FIELD = "uploadedAttachments";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type FileLike = { name: string; type: string; size: number };

/** 파일 하나가 규칙에 맞는지. 맞으면 null, 아니면 사용자에게 보여줄 문구. */
export function validateAttachmentFile(service: AttachmentServiceKey, file: FileLike): string | null {
  const p = ATTACHMENT_POLICY[service];
  if (!p.allowedTypes.includes(file.type)) {
    return `${file.name}: ${p.typeLabel} 파일만 올릴 수 있습니다.`;
  }
  if (file.size > ATTACHMENT_MAX_SIZE) {
    return `${file.name}: 파일은 20MB 이하만 올릴 수 있습니다(${formatFileSize(file.size)}).`;
  }
  return null;
}

/** 개수 상한은 "이미 붙어 있는 첨부 + 이번에 추가하는 것"을 합쳐서 본다 —
 * 수정 화면에서 기존 4개에 3개를 더 붙이는 걸 막기 위함. */
export function validateAttachmentFiles(
  service: AttachmentServiceKey,
  files: FileLike[],
  existingCount = 0
): string | null {
  const p = ATTACHMENT_POLICY[service];
  if (existingCount + files.length > p.maxCount) {
    return `첨부파일은 최대 ${p.maxCount}개까지입니다(현재 ${existingCount}개 + 추가 ${files.length}개).`;
  }
  for (const file of files) {
    const error = validateAttachmentFile(service, file);
    if (error) return error;
  }
  return null;
}

/** 서버 액션에서 FormData의 업로드 결과를 읽는다. 클라이언트가 보낸 값이므로
 * 형태만 검사하고, 크기·형식의 실제 강제는 버킷이 한다(파일 맨 위 주석 참고). */
export function parseUploadedAttachments(formData: FormData): UploadedAttachment[] {
  const raw = String(formData.get(UPLOADED_ATTACHMENTS_FIELD) ?? "").trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const { path, fileName, contentType, size } = item as Record<string, unknown>;
      if (typeof path !== "string" || !path || typeof fileName !== "string" || !fileName) return [];
      return [{
        path,
        fileName,
        contentType: typeof contentType === "string" ? contentType : "",
        size: typeof size === "number" ? size : 0,
      }];
    });
  } catch {
    return [];
  }
}

/** 서버 액션에서 검증할 때 쓰는 어댑터(업로드 메타데이터 → FileLike). */
export function asFileLike(uploaded: UploadedAttachment[]): FileLike[] {
  return uploaded.map((u) => ({ name: u.fileName, type: u.contentType, size: u.size }));
}
