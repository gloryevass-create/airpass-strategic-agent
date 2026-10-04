import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { after } from "next/server";
import { deleteAttachmentFromDrive, driveFileViewUrl } from "@/lib/googleDriveAttachments";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ATTACHMENT_POLICY,
  asFileLike,
  validateAttachmentFiles,
  type UploadedAttachment,
} from "@/lib/attachmentPolicy";

// SI Business/Cooperation/Marketing 보드의 "히스토리" 항목에 파일을 첨부하는
// 기능(2026-09-06)이 세 보드 모두 완전히 같은 구조(테이블명만 다름)라 공용
// 로직을 여기 하나로 모았다 — 실제 *_history_attachments 테이블 insert/select는
// 테이블명이 보드마다 달라 타입 안전하게 공용화할 수 없어서 호출부(보드별
// 서버 액션 파일)가 각자 한다. Work Journal 첨부(lib/googleDriveAttachments.ts를
// 감싸는 방식)와 동일한 원칙 — 구글드라이브가 설정돼 있으면 그쪽에, 아니면
// Supabase Storage "history-attachments" 버킷(세 보드가 공유, 경로를
// 서비스명/history_id로 구분)에 올린다.
export const HISTORY_ATTACHMENT_MAX_COUNT = ATTACHMENT_POLICY.history.maxCount;
const HISTORY_ATTACHMENTS_BUCKET = ATTACHMENT_POLICY.history.bucket;

/** 보드 쿼리 파일(lib/queries/businessProjectsV2.ts 등)이 히스토리 항목에 붙여
 * 반환하는 첨부파일 표시용 타입 — 세 보드 모두 이 모양 그대로 쓴다. */
export type HistoryAttachment = { id: string; fileName: string; url: string | null };

export function validateHistoryAttachmentFiles(uploaded: UploadedAttachment[]): string | null {
  return validateAttachmentFiles("history", asFileLike(uploaded));
}

export type HistoryAttachmentInsert = {
  file_name: string;
  content_type: string;
  storage_path: string | null;
  drive_file_id: string | null;
};

/** 브라우저가 이미 Storage에 올려둔 파일들을 insert()에 바로 넘길 수 있는
 * 레코드 배열로 바꾼다. 2026-09-29부터 파일 바이트는 서버를 거치지 않는다 —
 * 이유와 보안상 함의는 lib/attachmentPolicy.ts 맨 위 주석 참고.
 *
 * historyId를 더는 쓰지 않는다(경로는 브라우저가 업로드 시점에 정한다) —
 * 히스토리 행이 만들어지기 전에 파일이 먼저 올라가기 때문. 삭제는 항상 DB에
 * 저장된 전체 경로로 하므로 폴더명이 무엇이든 상관없다. */
export function buildHistoryAttachmentRows(uploaded: UploadedAttachment[]): HistoryAttachmentInsert[] {
  return uploaded.map((u) => ({
    file_name: u.fileName,
    content_type: u.contentType,
    storage_path: u.path,
    drive_file_id: null,
  }));
}

/** 히스토리 저장이 막혀 쓸 데가 없어진 업로드 파일을 응답 이후에 지운다. */
export function discardUploadedHistoryFiles(uploaded: UploadedAttachment[]): void {
  if (uploaded.length === 0) return;
  after(async () => {
    try {
      await createAdminClient().storage.from(HISTORY_ATTACHMENTS_BUCKET).remove(uploaded.map((u) => u.path));
    } catch (e) {
      console.error("[historyAttachments] 미사용 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
    }
  });
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

/** 히스토리를 지운 뒤 남는 첨부파일 실물을 응답 이후에 정리한다(2026-10-04,
 * 히스토리 삭제 기능 추가와 함께). 첨부 **행**은 cascade로 이미 사라지므로
 * 여기서는 Storage 오브젝트와 구글드라이브 파일만 치운다 — 안 치우면 참조가
 * 끊긴 고아 파일이 쌓인다(실제로 Work Journal에서 그렇게 200MB가 남았었다).
 *
 * after() 안에서는 세션 쿠키를 다시 쓸 수 없어 service_role로 지운다. 지울
 * 대상은 응답 전에 권한을 확인한 히스토리에서 읽어온 값이다. */
export function cleanUpHistoryAttachmentFilesAfterResponse(
  attachments: { storage_path: string | null; drive_file_id: string | null }[]
): void {
  const paths = attachments.map((a) => a.storage_path).filter((p): p is string => Boolean(p));
  const driveIds = attachments.map((a) => a.drive_file_id).filter((i): i is string => Boolean(i));
  if (paths.length === 0 && driveIds.length === 0) return;

  after(async () => {
    try {
      await Promise.all([
        paths.length
          ? createAdminClient().storage.from(HISTORY_ATTACHMENTS_BUCKET).remove(paths)
          : Promise.resolve(),
        ...driveIds.map((id) => deleteAttachmentFromDrive(id)),
      ]);
    } catch (e) {
      console.error("[historyAttachments] 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
    }
  });
}
