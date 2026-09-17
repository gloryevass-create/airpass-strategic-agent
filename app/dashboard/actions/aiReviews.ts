"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { notifyTeamAfterResponse } from "@/lib/notifyTeam";

const LIST_PATH = "/dashboard/ai-review";
const MAX_CONTENT_SIZE = 2 * 1024 * 1024; // 2MB — Meeting Notes와 동일한 상한.

/** Meeting Notes(app/dashboard/actions/meetingNotes.ts::resolveContent)와 완전히
 * 같은 로직 — 파일이 첨부됐으면 그 텍스트를 우선하고, 없으면 붙여넣은 텍스트를
 * 쓴다. 원본 파일은 저장하지 않고 텍스트만 DB에 남긴다. */
async function resolveContent(formData: FormData): Promise<{ content?: string; error?: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (!file.name.toLowerCase().endsWith(".md") && file.type !== "text/markdown" && file.type !== "text/plain") {
      return { error: "마크다운(.md) 파일만 올릴 수 있습니다." };
    }
    if (file.size > MAX_CONTENT_SIZE) {
      return { error: "파일은 2MB 이하만 올릴 수 있습니다." };
    }
    const content = await file.text();
    if (!content.trim()) return { error: "파일 내용이 비어 있습니다." };
    return { content };
  }

  const pasted = String(formData.get("content") ?? "").trim();
  if (!pasted) return { error: "파일을 올리거나 내용을 붙여넣어 주세요." };
  if (new TextEncoder().encode(pasted).length > MAX_CONTENT_SIZE) {
    return { error: "내용은 2MB 이하만 저장할 수 있습니다." };
  }
  return { content: pasted };
}

/** 제목을 안 적었으면 마크다운 첫 "# " 제목 줄을 자동으로 쓴다. */
function resolveTitle(formTitle: string, content: string): string | null {
  if (formTitle) return formTitle;
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export type AiReviewFormState = { error?: string } | undefined;

export async function createAiReview(
  _prevState: AiReviewFormState,
  formData: FormData
): Promise<AiReviewFormState> {
  const { supabase, user } = await requireAuthedClient();

  const { content, error: contentError } = await resolveContent(formData);
  if (contentError || !content) return { error: contentError ?? "내용을 확인하세요." };

  const formTitle = String(formData.get("title") ?? "").trim();
  const title = resolveTitle(formTitle, content);
  if (!title) return { error: "제목을 입력하거나, 내용 첫 줄에 '# 제목' 형식의 헤딩을 포함하세요." };

  const { data: review, error } = await supabase
    .from("ai_reviews")
    .insert({
      author_id: user.id,
      author_email: user.email ?? "",
      title,
      content,
    })
    .select("id")
    .single();

  if (error || !review) return { error: `저장 실패: ${error?.message ?? "알 수 없는 오류"}` };

  notifyTeamAfterResponse(user, (actor) => ({
    type: "ai_review",
    title,
    message: `${actor}님이 AI Review를 등록했습니다.`,
    link: `/dashboard/ai-review/${review.id}`,
  }));

  revalidatePath(LIST_PATH);
  redirect(`/dashboard/ai-review/${review.id}`);
}

async function canModifyReview(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  userId: string,
  reviewId: string
): Promise<boolean> {
  // 서로 의존하지 않는 두 조회라 나란히 보낸다(2026-09-17, Meeting Notes와 동일).
  const [{ data: review }, { data: profile }] = await Promise.all([
    supabase.from("ai_reviews").select("author_id").eq("id", reviewId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  if (!review) return false;
  return review.author_id === userId || profile?.role === "admin";
}

export async function updateAiReview(
  reviewId: string,
  _prevState: AiReviewFormState,
  formData: FormData
): Promise<AiReviewFormState> {
  const { supabase, user } = await requireAuthedClient();

  if (!(await canModifyReview(supabase, user.id, reviewId))) {
    return { error: "본인이 작성한 AI Review만 수정할 수 있습니다." };
  }

  const { content, error: contentError } = await resolveContent(formData);
  if (contentError || !content) return { error: contentError ?? "내용을 확인하세요." };

  const formTitle = String(formData.get("title") ?? "").trim();
  const title = resolveTitle(formTitle, content);
  if (!title) return { error: "제목을 입력하거나, 내용 첫 줄에 '# 제목' 형식의 헤딩을 포함하세요." };

  const { error } = await supabase
    .from("ai_reviews")
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq("id", reviewId);
  if (error) return { error: `수정 실패: ${error.message}` };

  revalidatePath(LIST_PATH);
  revalidatePath(`/dashboard/ai-review/${reviewId}`);
  redirect(`/dashboard/ai-review/${reviewId}`);
}

// formData는 폼 action 시그니처를 맞추기 위해서만 받는다(내용은 쓰지 않음).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteAiReview(reviewId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireAuthedClient();

  if (!(await canModifyReview(supabase, user.id, reviewId))) {
    redirect(`/dashboard/ai-review/${reviewId}`);
  }

  await supabase.from("ai_reviews").delete().eq("id", reviewId);

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

export type AiReviewCommentState = { error?: string } | undefined;

export async function createAiReviewComment(
  reviewId: string,
  _prevState: AiReviewCommentState,
  formData: FormData
): Promise<AiReviewCommentState> {
  const { supabase, user } = await requireAuthedClient();

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "의견 내용을 입력하세요." };

  const { error } = await supabase.from("ai_review_comments").insert({
    review_id: reviewId,
    author_id: user.id,
    author_email: user.email ?? "",
    content,
  });

  if (error) return { error: `의견 저장 실패: ${error.message}` };

  revalidatePath(`/dashboard/ai-review/${reviewId}`);
  return undefined;
}
