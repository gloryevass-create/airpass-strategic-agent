"use client";

import { createClient } from "@/lib/supabase/client";
import { safeStorageFileName } from "@/lib/storageKey";
import { WORK_JOURNAL_BUCKET, type UploadedAttachment } from "@/lib/workJournalAttachments";

/** 브라우저에서 Supabase Storage로 곧장 올린다 — 서버 액션을 거치지 않는다.
 *
 * 왜 이렇게 바꿨나(2026-09-29): 예전엔 폼이 파일 바이트를 통째로 서버 액션에
 * 실어 보냈는데, 그 경로엔 넘을 수 없는 상한이 둘 있다.
 *   ① Next.js Server Action 본문 기본 상한 1MB — 이 프로젝트는 설정한 적이
 *      없어서 계속 기본값이었다. 화면엔 "12MB 이하"라고 적혀 있었지만 실제로는
 *      사진 두 장만 골라도 합계가 1MB를 넘어 통째로 실패했다("파일 하나만 된다"의
 *      진짜 원인).
 *   ② Vercel Functions 요청 본문 4.5MB — 플랜과 무관한 플랫폼 하드 리밋이라
 *      next.config.ts를 아무리 올려도 배포 환경에선 413으로 막힌다.
 * 즉 20MB 첨부는 서버 액션 경로로는 구조적으로 불가능하다. 브라우저가 Storage에
 * 직접 올리면 두 상한을 모두 우회하고, 서버 액션에는 "어디에 올렸는지"(경로
 * 문자열)만 넘기므로 본문이 수백 바이트로 줄어든다.
 *
 * 권한: journal-attachments 버킷은 0042부터 authenticated면 누구나
 * insert/select/delete할 수 있었다 — 지금까지 서버가 대신 해주던 걸 브라우저가
 * 직접 하는 것뿐이라 새로 열리는 권한은 없다.
 *
 * 구글드라이브 분기는 이 경로에 없다 — 브라우저가 회사 드라이브 자격증명을
 * 가질 수 없기 때문. Work Journal 신규 첨부는 항상 Supabase Storage로 간다
 * (GOOGLE_DRIVE_ATTACHMENTS_ROOT_FOLDER_ID는 2026-09-07부터 비어 있어 현재
 * 동작 차이는 없고, 이미 드라이브에 있는 기존 첨부는 그대로 열람·삭제된다). */
export async function uploadWorkJournalFiles(
  files: File[],
  onFileDone?: (done: number, total: number) => void
): Promise<{ uploaded: UploadedAttachment[]; error?: string }> {
  if (files.length === 0) return { uploaded: [] };

  const supabase = createClient();
  // 한 번의 업로드 묶음을 한 폴더에 모은다. 예전엔 일지 id를 폴더명으로 썼는데
  // 새로 쓰는 일지는 아직 id가 없어서(저장 전에 올리므로) 묶음 id를 쓴다 —
  // 삭제는 항상 DB에 저장된 전체 경로로 하므로 폴더명이 무엇이든 상관없다.
  const batchId = globalThis.crypto.randomUUID();
  let done = 0;

  type Result = { path: string; uploaded?: UploadedAttachment; error?: string };
  const results: Result[] = await Promise.all(
    files.map(async (file): Promise<Result> => {
      const path = `${batchId}/${safeStorageFileName(file.name)}`;
      const { error } = await supabase.storage.from(WORK_JOURNAL_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      done += 1;
      onFileDone?.(done, files.length);
      if (error) return { path, error: `${file.name}: ${error.message}` };
      return { path, uploaded: { path, fileName: file.name, contentType: file.type, size: file.size } };
    })
  );

  const failed = results.filter((r) => r.error);
  const uploaded = results.flatMap((r) => (r.uploaded ? [r.uploaded] : []));

  // 일부만 올라간 채로 일지를 저장하면 사용자가 눈치채지 못한 채 첨부가 누락된다 —
  // 하나라도 실패하면 이미 올라간 것까지 지우고 통째로 실패로 알린다.
  if (failed.length > 0) {
    await deleteUploadedWorkJournalFiles(uploaded.map((u) => u.path));
    return { uploaded: [], error: `첨부파일 업로드 실패 — ${failed[0].error}` };
  }
  return { uploaded };
}

/** 올려두긴 했지만 일지 저장이 실패해 쓸 데가 없어진 파일을 지운다(고아 파일 방지).
 * 실패해도 조용히 넘어간다 — 이건 뒷정리라 사용자에게 보여줄 오류가 아니다. */
export async function deleteUploadedWorkJournalFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(WORK_JOURNAL_BUCKET).remove(paths);
  } catch (e) {
    console.error("[workJournalUpload] 미사용 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
  }
}
