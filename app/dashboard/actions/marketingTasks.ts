"use server";

import { revalidatePath } from "next/cache";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { notifyTeamAfterResponse } from "@/lib/notifyTeam";
import {
  buildHistoryAttachmentRows,
  discardUploadedHistoryFiles,
  validateHistoryAttachmentFiles,
} from "@/lib/historyAttachments";
import { parseUploadedAttachments } from "@/lib/attachmentPolicy";

const PATH = "/dashboard/marketing-tasks";

export type MarketingTaskFormState = { error?: string } | undefined;

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function dateOrNull(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw || null;
}

// MemberMultiSelect가 같은 name으로 여러 값을 제출하므로 getAll로 받는다
// (예전 "쉼표로 구분" 자유 텍스트 입력을 실제 팀원 선택으로 대체, 2026-08-23).
function listFromForm(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

function fieldsFromForm(formData: FormData) {
  return {
    title: text(formData, "title") ?? "",
    content: text(formData, "content"),
    category: text(formData, "category"),
    work_type: text(formData, "workType"),
    stage: text(formData, "stage"),
    status: text(formData, "status") ?? "시작 전",
    due_date: dateOrNull(formData, "dueDate"),
    due_date_end: dateOrNull(formData, "dueDateEnd"),
    assignees: listFromForm(formData, "assignees"),
  };
}

export async function createMarketingTask(
  _prevState: MarketingTaskFormState,
  formData: FormData
): Promise<MarketingTaskFormState> {
  const { supabase, user } = await requireAuthedClient();

  const fields = fieldsFromForm(formData);
  if (!fields.title) return { error: "업무명을 입력하세요." };

  const { data: inserted, error } = await supabase.from("marketing_tasks").insert(fields).select("id").single();
  if (error) return { error: `저장 실패: ${error.message}` };

  notifyTeamAfterResponse(user, (actor) => ({
    type: "marketing",
    title: fields.title,
    message: `${actor}님이 새 마케팅 업무를 등록했습니다.`,
    // 알림을 누르면 목록이 아니라 이 업무의 상세 팝업이 바로 열리게 ?open=id를
    // 붙인다(2026-09-16, 사용자 요청) — IndustryMarketingBoard.tsx가 마운트
    // 시 이 쿼리를 읽어 editingId를 채운다.
    link: `${PATH}?open=${inserted.id}`,
  }));

  revalidatePath(PATH);
  return undefined;
}

export async function updateMarketingTask(
  _prevState: MarketingTaskFormState,
  formData: FormData
): Promise<MarketingTaskFormState> {
  const { supabase } = await requireAuthedClient();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "잘못된 요청입니다." };

  const fields = fieldsFromForm(formData);
  if (!fields.title) return { error: "업무명을 입력하세요." };

  const { error } = await supabase
    .from("marketing_tasks")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: `저장 실패: ${error.message}` };

  revalidatePath(PATH);
  return undefined;
}

export async function deleteMarketingTask(id: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  await supabase.from("marketing_tasks").delete().eq("id", id);
  revalidatePath(PATH);
}

/** 카드에서 바로 분류(칸반 컬럼)를 옮길 때 쓰는 가벼운 액션(전체 폼을 열지 않아도 됨). */
export async function moveMarketingTaskCategory(id: string, category: string | null): Promise<void> {
  const { supabase } = await requireAuthedClient();
  await supabase
    .from("marketing_tasks")
    .update({ category, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(PATH);
}

/** 즐겨찾기는 팀 공유가 아니라 로그인한 본인 것만 켜고 끈다(SI Business
 * toggleBusinessProjectV2Favorite와 동일한 패턴, 2026-09-12). */
export async function toggleMarketingTaskFavorite(taskId: string): Promise<void> {
  const { supabase, user } = await requireAuthedClient();

  const { data: existing } = await supabase
    .from("marketing_tasks_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("task_id", taskId)
    .maybeSingle();

  if (existing) {
    await supabase.from("marketing_tasks_favorites").delete().eq("id", existing.id);
  } else {
    await supabase.from("marketing_tasks_favorites").insert({ user_id: user.id, task_id: taskId });
  }

  revalidatePath(PATH);
}

export type MarketingTaskCommentState = { error?: string } | undefined;

export async function createMarketingTaskComment(
  taskId: string,
  _prevState: MarketingTaskCommentState,
  formData: FormData
): Promise<MarketingTaskCommentState> {
  const { supabase, user } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "댓글 내용을 입력하세요." };

  const { error } = await supabase.from("marketing_tasks_comments").insert({
    task_id: taskId,
    author_id: user.id,
    author_email: user.email ?? "",
    content,
  });

  if (error) return { error: `댓글 저장 실패: ${error.message}` };

  revalidatePath(PATH);
  return undefined;
}


/** 댓글은 작성자 본인 또는 관리자만 지울 수 있다(2026-10-04, RLS 0084와 같은 규칙).
 * RLS만 믿으면 안 되는 이유: 막힌 delete는 에러 없이 0행 처리라 호출부가
 * 성공으로 오해한다. */
async function canDeleteComment(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  userId: string,
  table: "marketing_tasks_comments",
  commentId: string
): Promise<boolean> {
  const [{ data: comment }, { data: profile }] = await Promise.all([
    supabase.from(table).select("author_id").eq("id", commentId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  if (!comment) return false;
  return comment.author_id === userId || profile?.role === "admin";
}

export async function deleteMarketingTaskComment(commentId: string): Promise<void> {
  const { supabase, user } = await requireAuthedClient();
  if (!(await canDeleteComment(supabase, user.id, "marketing_tasks_comments", commentId))) return;
  await supabase.from("marketing_tasks_comments").delete().eq("id", commentId);
  revalidatePath(PATH);
}

export type MarketingTaskHistoryState = { error?: string } | undefined;

/** 히스토리는 댓글과 달리 삭제 기능을 두지 않는다 — 기록 자체가 사라지는 것을 막기 위함.
 * 다만 작성자 본인은 오탈자·내용을 바로잡을 수 있도록 수정은 허용한다. */
export async function createMarketingTaskHistoryEntry(
  taskId: string,
  _prevState: MarketingTaskHistoryState,
  formData: FormData
): Promise<MarketingTaskHistoryState> {
  const { supabase, user } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "히스토리 내용을 입력하세요." };

  // 첨부파일은 브라우저가 이미 Storage에 올려뒀고 여기엔 위치만 온다
  // (lib/attachmentPolicy.ts 맨 위 주석 참고).
  const uploaded = parseUploadedAttachments(formData);
  const fileError = validateHistoryAttachmentFiles(uploaded);
  if (fileError) {
    discardUploadedHistoryFiles(uploaded);
    return { error: fileError };
  }

  const { data: history, error } = await supabase
    .from("marketing_tasks_history")
    .insert({
      task_id: taskId,
      author_id: user.id,
      author_email: user.email ?? "",
      content,
    })
    .select("id")
    .single();

  if (error || !history) {
    discardUploadedHistoryFiles(uploaded);
    return { error: `히스토리 저장 실패: ${error?.message ?? "알 수 없는 오류"}` };
  }

  if (uploaded.length > 0) {
    const { error: attachError } = await supabase
      .from("marketing_tasks_history_attachments")
      .insert(buildHistoryAttachmentRows(uploaded).map((r) => ({ ...r, history_id: history.id })));
    // 예전엔 개별 파일 실패를 조용히 삼켰지만, 이제 바이트는 이미 다 올라간
    // 뒤라 여기서 실패하는 건 DB 문제뿐이다 — 조용히 넘기면 사용자는 첨부가
    // 붙은 줄 알게 되므로 그대로 알린다.
    if (attachError) {
      discardUploadedHistoryFiles(uploaded);
      return { error: `히스토리는 저장됐지만 첨부파일 연결에 실패했습니다: ${attachError.message}` };
    }
  }

  revalidatePath(PATH);
  return undefined;
}

export async function updateMarketingTaskHistoryEntry(
  historyId: string,
  _prevState: MarketingTaskHistoryState,
  formData: FormData
): Promise<MarketingTaskHistoryState> {
  const { supabase } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "히스토리 내용을 입력하세요." };

  const { error } = await supabase
    .from("marketing_tasks_history")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", historyId);

  if (error) return { error: `히스토리 수정 실패: ${error.message}` };

  revalidatePath(PATH);
  return undefined;
}
