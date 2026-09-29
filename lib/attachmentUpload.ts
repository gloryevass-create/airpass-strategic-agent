"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeStorageFileName } from "@/lib/storageKey";
import {
  ATTACHMENT_POLICY,
  UPLOADED_ATTACHMENTS_FIELD,
  type AttachmentServiceKey,
  type UploadedAttachment,
} from "@/lib/attachmentPolicy";

/** 브라우저에서 Supabase Storage로 곧장 올린다 — 서버 액션(그리고 Vercel)을
 * 거치지 않는다. 왜 이렇게 하는지는 lib/attachmentPolicy.ts 맨 위 주석 참고. */
export async function uploadAttachments(
  service: AttachmentServiceKey,
  files: File[],
  options?: { prefix?: string; onFileDone?: (done: number, total: number) => void }
): Promise<{ uploaded: UploadedAttachment[]; error?: string }> {
  if (files.length === 0) return { uploaded: [] };

  const bucket = ATTACHMENT_POLICY[service].bucket;
  const supabase = createClient();
  // 한 번의 업로드 묶음을 한 폴더에 모은다. 새로 쓰는 글은 아직 id가 없어서
  // (저장 전에 올리므로) 대상 id 대신 묶음 id를 쓴다 — 삭제는 항상 DB에
  // 저장된 전체 경로로 하므로 폴더명이 무엇이든 상관없다.
  const folder = [options?.prefix, globalThis.crypto.randomUUID()].filter(Boolean).join("/");
  let done = 0;

  type Result = { path: string; uploaded?: UploadedAttachment; error?: string };
  const results: Result[] = await Promise.all(
    files.map(async (file): Promise<Result> => {
      const path = `${folder}/${safeStorageFileName(file.name)}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      done += 1;
      options?.onFileDone?.(done, files.length);
      if (error) return { path, error: `${file.name}: ${error.message}` };
      return { path, uploaded: { path, fileName: file.name, contentType: file.type, size: file.size } };
    })
  );

  const failed = results.filter((r) => r.error);
  const uploaded = results.flatMap((r) => (r.uploaded ? [r.uploaded] : []));

  // 일부만 올라간 채로 저장하면 사용자가 눈치채지 못한 채 첨부가 누락된다 —
  // 하나라도 실패하면 이미 올라간 것까지 지우고 통째로 실패로 알린다.
  if (failed.length > 0) {
    await deleteUploadedAttachments(service, uploaded.map((u) => u.path));
    return { uploaded: [], error: `첨부파일 업로드 실패 — ${failed[0].error}` };
  }
  return { uploaded };
}

/** 올려두긴 했지만 저장이 실패해 쓸 데가 없어진 파일을 지운다(고아 파일 방지).
 * 실패해도 조용히 넘어간다 — 뒷정리라 사용자에게 보여줄 오류가 아니다. */
export async function deleteUploadedAttachments(
  service: AttachmentServiceKey,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(ATTACHMENT_POLICY[service].bucket).remove(paths);
  } catch (e) {
    console.error("[attachmentUpload] 미사용 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
  }
}

/** 첨부가 있는 폼이 공통으로 쓰는 상태 묶음.
 *
 * 쓰는 쪽은 ① <AttachmentPicker>에 files/setFiles를 넘기고 ② 제출 시
 * `await attachTo(formData)`가 true를 돌려줄 때만 서버 액션을 호출하고
 * ③ 서버가 오류를 돌려주면 `rollback()`으로 방금 올린 파일을 지운다. */
export function useAttachmentUpload(service: AttachmentServiceKey, prefix?: string) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadedPathsRef = useRef<string[]>([]);

  /** 파일을 올리고 formData에 위치를 심는다. 실패하면 false(폼은 제출하지 말 것). */
  async function attachTo(formData: FormData): Promise<boolean> {
    setUploadError(null);
    uploadedPathsRef.current = [];
    if (files.length === 0) return true;

    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const { uploaded, error } = await uploadAttachments(service, files, {
      prefix,
      onFileDone: (done, total) => setProgress({ done, total }),
    });
    setUploading(false);
    setProgress(null);
    if (error) {
      setUploadError(error);
      return false;
    }
    uploadedPathsRef.current = uploaded.map((u) => u.path);
    formData.set(UPLOADED_ATTACHMENTS_FIELD, JSON.stringify(uploaded));
    return true;
  }

  function rollback(): void {
    void deleteUploadedAttachments(service, uploadedPathsRef.current);
    uploadedPathsRef.current = [];
  }

  function reset(): void {
    setFiles([]);
    uploadedPathsRef.current = [];
    setUploadError(null);
  }

  return { files, setFiles, uploading, progress, uploadError, attachTo, rollback, reset };
}
