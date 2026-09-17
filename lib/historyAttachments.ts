import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { safeStorageFileName } from "@/lib/storageKey";
import {
  driveFileViewUrl,
  isGoogleDriveAttachmentsConfigured,
  uploadAttachmentToDrive,
  type AttachmentService,
} from "@/lib/googleDriveAttachments";

// SI Business/Cooperation/Marketing 보드의 "히스토리" 항목에 파일을 첨부하는
// 기능(2026-09-06)이 세 보드 모두 완전히 같은 구조(테이블명만 다름)라 공용
// 로직을 여기 하나로 모았다 — 실제 *_history_attachments 테이블 insert/select는
// 테이블명이 보드마다 달라 타입 안전하게 공용화할 수 없어서 호출부(보드별
// 서버 액션 파일)가 각자 한다. Work Journal 첨부(lib/googleDriveAttachments.ts를
// 감싸는 방식)와 동일한 원칙 — 구글드라이브가 설정돼 있으면 그쪽에, 아니면
// Supabase Storage "history-attachments" 버킷(세 보드가 공유, 경로를
// 서비스명/history_id로 구분)에 올린다.
const HISTORY_ATTACHMENT_ALLOWED_TYPES = [
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
export const HISTORY_ATTACHMENT_MAX_SIZE = 12 * 1024 * 1024;
export const HISTORY_ATTACHMENT_MAX_COUNT = 5;
const HISTORY_ATTACHMENTS_BUCKET = "history-attachments";

/** 보드 쿼리 파일(lib/queries/businessProjectsV2.ts 등)이 히스토리 항목에 붙여
 * 반환하는 첨부파일 표시용 타입 — 세 보드 모두 이 모양 그대로 쓴다. */
export type HistoryAttachment = { id: string; fileName: string; url: string | null };

export function validateHistoryAttachmentFiles(files: File[]): string | null {
  if (files.length > HISTORY_ATTACHMENT_MAX_COUNT) {
    return `첨부파일은 한 번에 최대 ${HISTORY_ATTACHMENT_MAX_COUNT}개까지 올릴 수 있습니다.`;
  }
  for (const file of files) {
    if (!HISTORY_ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
      return `${file.name}: 이미지·PDF·Office 문서·ZIP 파일만 올릴 수 있습니다.`;
    }
    if (file.size > HISTORY_ATTACHMENT_MAX_SIZE) {
      return `${file.name}: 파일은 12MB 이하만 올릴 수 있습니다.`;
    }
  }
  return null;
}

export type HistoryAttachmentInsert = {
  file_name: string;
  content_type: string;
  storage_path: string | null;
  drive_file_id: string | null;
};

/** 파일들을 업로드하고 insert()에 바로 넘길 수 있는 레코드 배열로 돌려준다.
 * 개별 파일 업로드 실패는 조용히 건너뛴다(히스토리 등록 자체를 막으면 안 됨). */
export async function resolveHistoryAttachments(
  supabase: SupabaseClient<Database>,
  service: AttachmentService,
  historyId: string,
  files: File[]
): Promise<HistoryAttachmentInsert[]> {
  const useDrive = await isGoogleDriveAttachmentsConfigured();

  // 파일마다 순서대로 업로드하면 첨부 5개(상한)를 붙인 사람은 업로드 시간이
  // 그대로 5배로 쌓인다 — 서로 독립적인 업로드라 나란히 올린다(2026-09-17).
  // 실패한 파일만 조용히 빠지고 나머지는 원래 순서를 유지한다.
  const results = await Promise.all(
    files.map(async (file): Promise<HistoryAttachmentInsert | null> => {
      if (useDrive) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const fileId = await uploadAttachmentToDrive(service, file.name, bytes, file.type).catch((e) => {
          console.error(`[resolveHistoryAttachments] 업로드 실패 (${file.name}):`, e instanceof Error ? e.message : e);
          return null;
        });
        if (!fileId) return null;
        return { file_name: file.name, content_type: file.type, storage_path: null, drive_file_id: fileId };
      }

      const path = `${service}/${historyId}/${safeStorageFileName(file.name)}`;
      const { error } = await supabase.storage
        .from(HISTORY_ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (error) {
        console.error(`[resolveHistoryAttachments] 업로드 실패 (${file.name}):`, error.message);
        return null;
      }
      return { file_name: file.name, content_type: file.type, storage_path: path, drive_file_id: null };
    })
  );

  return results.filter((r): r is HistoryAttachmentInsert => r !== null);
}

/** 조회 시점에 표시용 URL을 만든다 — 구글드라이브는 API 호출 없이 고정 링크로
 * 바로 나오고, Storage 폴백만 signed URL 발급(비동기)이 필요하다. */
export async function resolveHistoryAttachmentUrls(
  supabase: SupabaseClient<Database>,
  attachments: { id: string; storagePath: string | null; driveFileId: string | null }[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  for (const a of attachments) {
    if (a.driveFileId) map.set(a.id, driveFileViewUrl(a.driveFileId));
  }

  const legacy = attachments.filter((a) => a.storagePath && !a.driveFileId);
  if (legacy.length > 0) {
    const signedUrls = await Promise.all(
      legacy.map((a) => supabase.storage.from(HISTORY_ATTACHMENTS_BUCKET).createSignedUrl(a.storagePath as string, 60 * 60))
    );
    legacy.forEach((a, i) => {
      const url = signedUrls[i].data?.signedUrl;
      if (url) map.set(a.id, url);
    });
  }

  return map;
}
