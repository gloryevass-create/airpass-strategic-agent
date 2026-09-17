"use server";

import { revalidatePath } from "next/cache";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { notifyTeamAfterResponse } from "@/lib/notifyTeam";
import { resolveHistoryAttachments, validateHistoryAttachmentFiles } from "@/lib/historyAttachments";

const PATH = "/dashboard/business2";
// SI Business 2(Industry 디자인 시스템 재구현, 2026-08-28)는 같은 business_projects_v2
// 데이터를 다른 화면으로 보여줄 뿐이라 이 액션들을 그대로 재사용한다 — 두 화면
// 다 캐시가 갱신되도록 항상 같이 무효화한다.
const PATH_V2_REDESIGN = "/dashboard/business";

function revalidateBusinessPaths() {
  revalidatePath(PATH);
  revalidatePath(PATH_V2_REDESIGN);
}

export type BusinessProjectV2FormState = { error?: string } | undefined;

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function numberOrNull(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw ? Number(raw) : null;
}

function dateOrNull(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw || null;
}

// MemberMultiSelect가 같은 name으로 여러 값을 제출하므로 getAll로 받는다
// (예전 "쉼표로 구분" 자유 텍스트 입력을 실제 팀원 선택으로 대체, 2026-08-23).
function assigneesFromForm(formData: FormData): string[] {
  return formData.getAll("assignees").map(String).filter(Boolean);
}

function fieldsFromForm(formData: FormData) {
  return {
    title: text(formData, "title") ?? "",
    stage: text(formData, "stage"),
    status: text(formData, "status") ?? "시작 전",
    org_name: text(formData, "orgName"),
    participation_type: text(formData, "participationType"),
    work_type: text(formData, "workType"),
    result: text(formData, "result"),
    amount: numberOrNull(formData, "amount"),
    progress_rate: numberOrNull(formData, "progressRate"),
    submission_date: dateOrNull(formData, "submissionDate"),
    submission_method: text(formData, "submissionMethod"),
    presentation_date: dateOrNull(formData, "presentationDate"),
    construction_start: dateOrNull(formData, "constructionStart"),
    construction_end: dateOrNull(formData, "constructionEnd"),
    construction_content: text(formData, "constructionContent"),
    assignees: assigneesFromForm(formData),
    notes: text(formData, "notes"),
  };
}

export async function createBusinessProjectV2(
  _prevState: BusinessProjectV2FormState,
  formData: FormData
): Promise<BusinessProjectV2FormState> {
  const { supabase, user } = await requireAuthedClient();

  const fields = fieldsFromForm(formData);
  if (!fields.title) return { error: "사업명을 입력하세요." };

  const { data: inserted, error } = await supabase.from("business_projects_v2").insert(fields).select("id").single();
  if (error) return { error: `저장 실패: ${error.message}` };

  notifyTeamAfterResponse(user, (actor) => ({
    type: "business",
    title: fields.title,
    message: `${actor}님이 새 SI Business 항목을 등록했습니다.`,
    // 알림을 눌렀을 때 목록이 아니라 이 사업의 상세 팝업이 바로 열리도록
    // ?open=id를 붙인다(2026-09-16, 사용자 요청) — IndustryBusinessBoard.tsx가
    // 마운트 시 이 쿼리를 읽어 editingId를 채운다. 두 화면이 같은 데이터를
    // 보므로 새로 그린 화면(PATH_V2_REDESIGN) 쪽으로 보낸다(사이드바 기본
    // 메뉴가 이쪽이라 — 옛 /dashboard/business2는 그대로 둠).
    link: `${PATH_V2_REDESIGN}?open=${inserted.id}`,
  }));

  revalidateBusinessPaths();
  return undefined;
}

export async function updateBusinessProjectV2(
  _prevState: BusinessProjectV2FormState,
  formData: FormData
): Promise<BusinessProjectV2FormState> {
  const { supabase } = await requireAuthedClient();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "잘못된 요청입니다." };

  const fields = fieldsFromForm(formData);
  if (!fields.title) return { error: "사업명을 입력하세요." };

  const { error } = await supabase
    .from("business_projects_v2")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: `저장 실패: ${error.message}` };

  revalidateBusinessPaths();
  return undefined;
}

export async function deleteBusinessProjectV2(id: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  await supabase.from("business_projects_v2").delete().eq("id", id);
  revalidateBusinessPaths();
}

/** 카드에서 바로 단계를 옮길 때 쓰는 가벼운 액션(전체 폼을 열지 않아도 됨). */
export async function moveBusinessProjectV2Stage(id: string, stage: string | null): Promise<void> {
  const { supabase } = await requireAuthedClient();
  await supabase
    .from("business_projects_v2")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidateBusinessPaths();
}

/** 즐겨찾기는 팀 공유가 아니라 로그인한 본인 것만 켜고 끈다(제품 카탈로그
 * toggleProductFavorite와 동일한 패턴, 2026-09-12). */
export async function toggleBusinessProjectV2Favorite(projectId: string): Promise<void> {
  const { supabase, user } = await requireAuthedClient();

  const { data: existing } = await supabase
    .from("business_projects_v2_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) {
    await supabase.from("business_projects_v2_favorites").delete().eq("id", existing.id);
  } else {
    await supabase.from("business_projects_v2_favorites").insert({ user_id: user.id, project_id: projectId });
  }

  revalidateBusinessPaths();
}

export type BusinessProjectV2CommentState = { error?: string } | undefined;

export async function createBusinessProjectV2Comment(
  projectId: string,
  _prevState: BusinessProjectV2CommentState,
  formData: FormData
): Promise<BusinessProjectV2CommentState> {
  const { supabase, user } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "댓글 내용을 입력하세요." };

  const { error } = await supabase.from("business_projects_v2_comments").insert({
    project_id: projectId,
    author_id: user.id,
    author_email: user.email ?? "",
    content,
  });

  if (error) return { error: `댓글 저장 실패: ${error.message}` };

  revalidateBusinessPaths();
  return undefined;
}

export async function deleteBusinessProjectV2Comment(commentId: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  await supabase.from("business_projects_v2_comments").delete().eq("id", commentId);
  revalidateBusinessPaths();
}

export type BusinessProjectV2HistoryState = { error?: string } | undefined;

/** 히스토리는 댓글과 달리 삭제 기능을 두지 않는다 — 기록 자체가 사라지는 것을 막기 위함.
 * 다만 작성자 본인은 오탈자·내용을 바로잡을 수 있도록 수정은 허용한다. */
export async function createBusinessProjectV2HistoryEntry(
  projectId: string,
  _prevState: BusinessProjectV2HistoryState,
  formData: FormData
): Promise<BusinessProjectV2HistoryState> {
  const { supabase, user } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "히스토리 내용을 입력하세요." };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const fileError = validateHistoryAttachmentFiles(files);
  if (fileError) return { error: fileError };

  const { data: history, error } = await supabase
    .from("business_projects_v2_history")
    .insert({
      project_id: projectId,
      author_id: user.id,
      author_email: user.email ?? "",
      content,
    })
    .select("id")
    .single();

  if (error || !history) return { error: `히스토리 저장 실패: ${error?.message ?? "알 수 없는 오류"}` };

  if (files.length > 0) {
    const resolved = await resolveHistoryAttachments(supabase, "business", history.id, files);
    if (resolved.length > 0) {
      await supabase
        .from("business_projects_v2_history_attachments")
        .insert(resolved.map((r) => ({ ...r, history_id: history.id })));
    }
  }

  revalidateBusinessPaths();
  return undefined;
}

export async function updateBusinessProjectV2HistoryEntry(
  historyId: string,
  _prevState: BusinessProjectV2HistoryState,
  formData: FormData
): Promise<BusinessProjectV2HistoryState> {
  const { supabase } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "히스토리 내용을 입력하세요." };

  const { error } = await supabase
    .from("business_projects_v2_history")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", historyId);

  if (error) return { error: `히스토리 수정 실패: ${error.message}` };

  revalidateBusinessPaths();
  return undefined;
}
