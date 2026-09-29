"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MemoCategory } from "@/lib/queries/memos";
import { notifyTeamAfterResponse } from "@/lib/notifyTeam";
import { deleteAttachmentFromDrive } from "@/lib/googleDriveAttachments";
import {
  ATTACHMENT_POLICY,
  asFileLike,
  parseUploadedAttachments,
  validateAttachmentFiles,
  type UploadedAttachment,
} from "@/lib/attachmentPolicy";

const CATEGORIES: MemoCategory[] = ["business", "cooperation", "marketing", "etc"];

// 협력사 서류 첨부(vendors.ts)와 동일한 크기 상한을 쓰되, 메모는 스크린샷·
// 기획서·시트 등 더 다양한 자료가 붙으므로 MIME 화이트리스트는 이미지/PDF/오피스
// 문서/ZIP까지 넓게 잡는다. 이전에는 크기·형식 제한이 전혀 없었고 업로드 실패가
// 조용히 무시돼(`continue`) 사용자가 원인을 알 수 없었다 — 이제 저장 전에 미리
// 걸러 에러를 보여준다(사용자 확인, 2026-08-23).
const MEMO_BUCKET = ATTACHMENT_POLICY.memo.bucket;

type MemoAttachmentRow = {
  memo_id: string;
  file_name: string;
  file_size: number;
  storage_path: string | null;
  drive_file_id: string | null;
};

/** 브라우저가 이미 Storage에 올려둔 파일들의 행을 만든다(작성·수정 공용).
 * 2026-09-29부터 파일 바이트는 서버를 거치지 않는다 — 이유와 보안상 함의는
 * lib/attachmentPolicy.ts 맨 위 주석 참고. */
async function insertMemoAttachments(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  memoId: string,
  uploaded: UploadedAttachment[],
  label: string
): Promise<{ failed: boolean }> {
  if (uploaded.length === 0) return { failed: false };
  const rows: MemoAttachmentRow[] = uploaded.map((u) => ({
    memo_id: memoId,
    file_name: u.fileName,
    file_size: u.size,
    storage_path: u.path,
    drive_file_id: null,
  }));
  const { error } = await supabase.from("ad_strategy_memo_attachments").insert(rows);
  if (error) {
    console.error(`[${label}] 첨부파일 연결 실패:`, error.message);
    // 붙을 곳이 없어진 파일은 지운다(고아 파일 방지).
    discardUploadedMemoFiles(uploaded);
    return { failed: true };
  }
  return { failed: false };
}

/** 저장이 막혀 쓸 데가 없어진 업로드 파일을 응답 이후에 지운다. */
function discardUploadedMemoFiles(uploaded: UploadedAttachment[]): void {
  if (uploaded.length === 0) return;
  after(async () => {
    try {
      await createAdminClient().storage.from(MEMO_BUCKET).remove(uploaded.map((u) => u.path));
    } catch (e) {
      console.error("[memos] 미사용 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
    }
  });
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
  const uploaded = parseUploadedAttachments(formData);
  /** 저장을 중단할 때 이미 올라간 첨부를 함께 정리한다(고아 파일 방지). */
  const fail = (error: string) => {
    discardUploadedMemoFiles(uploaded);
    return { error };
  };

  if (!CATEGORIES.includes(category as MemoCategory)) {
    return fail("구분을 선택하세요.");
  }
  if (!title) return fail("제목을 입력하세요.");
  if (!content) return fail("내용을 입력하세요.");

  const fileError = validateAttachmentFiles("memo", asFileLike(uploaded));
  if (fileError) return fail(fileError);

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
    return fail(`저장 실패: ${error?.message ?? "알 수 없는 오류"}`);
  }

  const { failed: attachmentFailed } = await insertMemoAttachments(supabase, memo.id, uploaded, "createMemo");

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
  const uploaded = parseUploadedAttachments(formData);
  /** 저장을 중단할 때 이미 올라간 첨부를 함께 정리한다(고아 파일 방지). */
  const fail = (error: string) => {
    discardUploadedMemoFiles(uploaded);
    return { error };
  };
  const removeAttachmentIds = formData.getAll("removeAttachments").map(String);

  if (!CATEGORIES.includes(category as MemoCategory)) {
    return fail("구분을 선택하세요.");
  }
  if (!title) return fail("제목을 입력하세요.");
  if (!content) return fail("내용을 입력하세요.");

  // 개수 상한은 "남길 기존 첨부 + 이번에 추가하는 것"으로 센다.
  const { count: keptCount } = uploaded.length
    ? await supabase
        .from("ad_strategy_memo_attachments")
        .select("id", { count: "exact", head: true })
        .eq("memo_id", memoId)
        .not("id", "in", `(${removeAttachmentIds.length ? removeAttachmentIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
    : { count: 0 };
  const fileError = validateAttachmentFiles("memo", asFileLike(uploaded), keptCount ?? 0);
  if (fileError) return fail(fileError);

  const { error } = await supabase
    .from("ad_strategy_memos")
    .update({ category: category as MemoCategory, title, content })
    .eq("id", memoId);

  if (error) return fail(`수정 실패: ${error.message}`);

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

  const { failed: attachmentFailed } = await insertMemoAttachments(supabase, memoId, uploaded, "updateMemo");

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
