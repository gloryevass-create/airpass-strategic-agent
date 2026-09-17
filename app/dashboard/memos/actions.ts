"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MemoCategory } from "@/lib/queries/memos";
import { notifyTeamAfterResponse } from "@/lib/notifyTeam";
import { deleteAttachmentFromDrive, isGoogleDriveAttachmentsConfigured, uploadAttachmentToDrive } from "@/lib/googleDriveAttachments";
import { safeStorageFileName } from "@/lib/storageKey";

const CATEGORIES: MemoCategory[] = ["business", "cooperation", "marketing", "etc"];

// 협력사 서류 첨부(vendors.ts)와 동일한 크기 상한(12MB)을 쓰되, 메모는 스크린샷·
// 기획서·시트 등 더 다양한 자료가 붙으므로 MIME 화이트리스트는 이미지/PDF/오피스
// 문서/ZIP까지 넓게 잡는다. 이전에는 크기·형식 제한이 전혀 없었고 업로드 실패가
// 조용히 무시돼(`continue`) 사용자가 원인을 알 수 없었다 — 이제 저장 전에 미리
// 걸러 에러를 보여준다(사용자 확인, 2026-08-23).
const MEMO_ATTACHMENT_ALLOWED_TYPES = [
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
const MEMO_ATTACHMENT_MAX_SIZE = 12 * 1024 * 1024;
const MEMO_ATTACHMENT_MAX_COUNT = 5;

/** 업로드 시도 전에 미리 검증해서, 저장 실패가 조용히 무시되지 않고 사용자에게
 * 명확한 이유와 함께 보이게 한다. 하나라도 걸리면 전체 저장을 막는다(부분 저장 방지). */
function validateMemoFiles(files: File[]): string | null {
  if (files.length > MEMO_ATTACHMENT_MAX_COUNT) {
    return `첨부파일은 한 번에 최대 ${MEMO_ATTACHMENT_MAX_COUNT}개까지 올릴 수 있습니다.`;
  }
  for (const file of files) {
    if (!MEMO_ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
      return `${file.name}: 이미지·PDF·Office 문서·ZIP 파일만 올릴 수 있습니다.`;
    }
    if (file.size > MEMO_ATTACHMENT_MAX_SIZE) {
      return `${file.name}: 파일은 12MB 이하만 올릴 수 있습니다.`;
    }
  }
  return null;
}

const MEMO_BUCKET = "memo-attachments";

type MemoAttachmentRow = {
  memo_id: string;
  file_name: string;
  file_size: number;
  storage_path: string | null;
  drive_file_id: string | null;
};

/** 첨부파일들을 올리고 insert할 행 배열을 돌려준다(작성·수정 공용, 2026-09-17).
 * 예전엔 작성/수정 액션이 각자 똑같은 for 루프로 "한 파일 올리고 → 그 행 insert →
 * 다음 파일"을 반복해서, 첨부 5개(상한)면 왕복 10회가 순서대로 쌓였다 — 업로드는
 * 나란히 하고 행은 한 번에 insert한다. 개별 실패는 예전처럼 건너뛰되 failed로
 * 알려서 호출부가 ?attachmentError=1을 붙일 수 있게 한다. */
async function uploadMemoAttachments(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  memoId: string,
  files: File[],
  label: string
): Promise<{ failed: boolean }> {
  if (files.length === 0) return { failed: false };

  const useDrive = await isGoogleDriveAttachmentsConfigured();
  const results = await Promise.all(
    files.map(async (file): Promise<MemoAttachmentRow | null> => {
      if (useDrive) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const fileId = await uploadAttachmentToDrive("memo", file.name, bytes, file.type).catch((e) => {
          console.error(`[${label}] 첨부파일 업로드 실패 (${file.name}):`, e instanceof Error ? e.message : e);
          return null;
        });
        if (!fileId) return null;
        return { memo_id: memoId, file_name: file.name, file_size: file.size, storage_path: null, drive_file_id: fileId };
      }
      const path = `${memoId}/${safeStorageFileName(file.name)}`;
      const { error } = await supabase.storage.from(MEMO_BUCKET).upload(path, file, { contentType: file.type });
      if (error) {
        console.error(`[${label}] 첨부파일 업로드 실패 (${file.name}):`, error.message);
        return null;
      }
      return { memo_id: memoId, file_name: file.name, file_size: file.size, storage_path: path, drive_file_id: null };
    })
  );

  const rows = results.filter((r): r is MemoAttachmentRow => r !== null);
  if (rows.length > 0) await supabase.from("ad_strategy_memo_attachments").insert(rows);
  return { failed: rows.length !== files.length };
}

/** 첨부파일 실물(Storage/구글드라이브)을 응답 이후에 지운다 — DB 행이 사라진
 * 뒤 하는 뒷정리라 사용자가 기다릴 필요가 없다(2026-09-17). after() 안에서는
 * 세션 쿠키를 다시 쓸 수 없어 service_role 클라이언트로 지운다(지울 경로는
 * 이미 응답 전에 권한이 확인된 행에서 읽어온 값). */
function cleanUpMemoFilesAfterResponse(
  attachments: { storage_path: string | null; drive_file_id: string | null }[]
): void {
  const legacyPaths = attachments.map((a) => a.storage_path).filter((p): p is string => Boolean(p));
  const driveIds = attachments.map((a) => a.drive_file_id).filter((i): i is string => Boolean(i));
  if (legacyPaths.length === 0 && driveIds.length === 0) return;

  after(async () => {
    try {
      await Promise.all([
        legacyPaths.length ? createAdminClient().storage.from(MEMO_BUCKET).remove(legacyPaths) : Promise.resolve(),
        ...driveIds.map((fileId) => deleteAttachmentFromDrive(fileId)),
      ]);
    } catch (e) {
      console.error("[memos] 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
    }
  });
}

export type CreateMemoState = { error?: string } | undefined;

export async function createMemo(_prevState: CreateMemoState, formData: FormData): Promise<CreateMemoState> {
  const { supabase, user } = await requireAuthedClient();

  const category = String(formData.get("category") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!CATEGORIES.includes(category as MemoCategory)) {
    return { error: "구분을 선택하세요." };
  }
  if (!title) return { error: "제목을 입력하세요." };
  if (!content) return { error: "내용을 입력하세요." };

  const fileError = validateMemoFiles(files);
  if (fileError) return { error: fileError };

  const { data: memo, error } = await supabase
    .from("ad_strategy_memos")
    .insert({
      author_id: user.id,
      author_email: user.email ?? "",
      category: category as MemoCategory,
      title,
      content,
    })
    .select("id")
    .single();

  if (error || !memo) {
    return { error: `저장 실패: ${error?.message ?? "알 수 없는 오류"}` };
  }

  const { failed: attachmentFailed } = await uploadMemoAttachments(supabase, memo.id, files, "createMemo");

  notifyTeamAfterResponse(user, (actor) => ({
    type: "memo",
    title,
    message: `${actor}님이 광고전략메모를 작성했습니다.`,
    link: `/dashboard/memos/${memo.id}`,
  }));

  revalidatePath("/dashboard/memos");
  redirect(`/dashboard/memos/${memo.id}${attachmentFailed ? "?attachmentError=1" : ""}`);
}

async function canModifyMemo(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  userId: string,
  memoId: string
): Promise<{ allowed: boolean; authorId?: string }> {
  // 서로 의존하지 않는 두 조회라 나란히 보낸다(2026-09-17).
  const [{ data: memo }, { data: profile }] = await Promise.all([
    supabase.from("ad_strategy_memos").select("author_id").eq("id", memoId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  if (!memo) return { allowed: false };

  const allowed = memo.author_id === userId || profile?.role === "admin";
  return { allowed, authorId: memo.author_id };
}

export type UpdateMemoState = { error?: string } | undefined;

export async function updateMemo(
  memoId: string,
  _prevState: UpdateMemoState,
  formData: FormData
): Promise<UpdateMemoState> {
  const { supabase, user } = await requireAuthedClient();

  const { allowed } = await canModifyMemo(supabase, user.id, memoId);
  if (!allowed) return { error: "본인이 작성한 메모만 수정할 수 있습니다." };

  const category = String(formData.get("category") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const removeAttachmentIds = formData.getAll("removeAttachments").map(String);

  if (!CATEGORIES.includes(category as MemoCategory)) {
    return { error: "구분을 선택하세요." };
  }
  if (!title) return { error: "제목을 입력하세요." };
  if (!content) return { error: "내용을 입력하세요." };

  const fileError = validateMemoFiles(files);
  if (fileError) return { error: fileError };

  const { error } = await supabase
    .from("ad_strategy_memos")
    .update({ category: category as MemoCategory, title, content })
    .eq("id", memoId);

  if (error) return { error: `수정 실패: ${error.message}` };

  // 지울 행을 삭제하면서 그 행의 파일 정보를 응답으로 함께 받아온다(조회 →
  // 파일 삭제 → 행 삭제로 줄줄이 기다리던 것을 한 번의 왕복으로, 2026-09-17).
  if (removeAttachmentIds.length > 0) {
    const { data: removed } = await supabase
      .from("ad_strategy_memo_attachments")
      .delete()
      .in("id", removeAttachmentIds)
      .select("storage_path, drive_file_id");
    if (removed?.length) cleanUpMemoFilesAfterResponse(removed);
  }

  const { failed: attachmentFailed } = await uploadMemoAttachments(supabase, memoId, files, "updateMemo");

  revalidatePath(`/dashboard/memos/${memoId}`);
  revalidatePath("/dashboard/memos");
  redirect(`/dashboard/memos/${memoId}${attachmentFailed ? "?attachmentError=1" : ""}`);
}

// formData는 폼 action 시그니처를 맞추기 위해서만 받는다(내용은 쓰지 않음).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteMemo(memoId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireAuthedClient();

  const { allowed } = await canModifyMemo(supabase, user.id, memoId);
  if (!allowed) redirect(`/dashboard/memos/${memoId}`);

  // 첨부 행은 메모 삭제 시 cascade로 함께 지워지므로, 실물 파일 경로만 미리
  // 읽어두고 메모를 지운 뒤 파일 정리는 응답 이후로 미룬다(2026-09-17).
  const { data: attachments } = await supabase
    .from("ad_strategy_memo_attachments")
    .select("storage_path, drive_file_id")
    .eq("memo_id", memoId);

  await supabase.from("ad_strategy_memos").delete().eq("id", memoId);
  cleanUpMemoFilesAfterResponse(attachments ?? []);

  revalidatePath("/dashboard/memos");
  redirect("/dashboard/memos");
}

export type CreateCommentState = { error?: string } | undefined;

export async function createComment(
  memoId: string,
  _prevState: CreateCommentState,
  formData: FormData
): Promise<CreateCommentState> {
  const { supabase, user } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "댓글 내용을 입력하세요." };

  const { error } = await supabase.from("ad_strategy_memo_comments").insert({
    memo_id: memoId,
    author_id: user.id,
    author_email: user.email ?? "",
    content,
  });

  if (error) return { error: `댓글 저장 실패: ${error.message}` };

  revalidatePath(`/dashboard/memos/${memoId}`);
  return undefined;
}
