"use server";

import { revalidatePath } from "next/cache";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { notifyTeamAfterResponse } from "@/lib/notifyTeam";

const PATH = "/dashboard/ai-tools";

export type AiToolFormState = { error?: string } | undefined;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function canModifyTool(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  userId: string,
  toolId: string
): Promise<boolean> {
  // 두 조회는 서로 의존하지 않으므로 나란히 보낸다 — 순서대로 기다리면 수정·삭제
  // 버튼을 누른 사람이 왕복 2회를 연달아 기다리게 된다(2026-09-17).
  const [{ data: tool }, { data: profile }] = await Promise.all([
    supabase.from("ai_tools").select("author_id").eq("id", toolId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  if (!tool) return false;
  return tool.author_id === userId || profile?.role === "admin";
}

export async function createAiTool(_prevState: AiToolFormState, formData: FormData): Promise<AiToolFormState> {
  const { supabase, user } = await requireAuthedClient();

  const title = String(formData.get("title") ?? "").trim();
  const url = normalizeUrl(String(formData.get("url") ?? ""));
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!title) return { error: "제목을 입력하세요." };
  if (!url) return { error: "링크를 입력하세요." };

  const { data: inserted, error } = await supabase
    .from("ai_tools")
    .insert({
      author_id: user.id,
      author_email: user.email ?? "",
      title,
      url,
      description,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: `저장 실패: ${error?.message ?? "알 수 없는 오류"}` };

  // 워크스페이스 다른 게시판(Memo Board/Meeting Notes/AI Review 등)과 마찬가지로
  // 새 항목 등록을 팀 알림 피드에 남긴다(2026-09-16, 사용자 확인 — AI HUB만
  // 알림이 빠져있던 걸 발견). 알림을 누르면 목록이 아니라 이 도구 상세가
  // 바로 열리도록 ?open=id를 붙인다(AiToolsBoard.tsx가 마운트 시 읽음).
  notifyTeamAfterResponse(user, (actor) => ({
    type: "ai_tool",
    title,
    message: `${actor}님이 새 AI 도구를 등록했습니다.`,
    link: `${PATH}?open=${inserted.id}`,
  }));

  revalidatePath(PATH);
  return undefined;
}

export async function updateAiTool(
  toolId: string,
  _prevState: AiToolFormState,
  formData: FormData
): Promise<AiToolFormState> {
  const { supabase, user } = await requireAuthedClient();

  if (!(await canModifyTool(supabase, user.id, toolId))) {
    return { error: "본인이 등록한 링크만 수정할 수 있습니다." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const url = normalizeUrl(String(formData.get("url") ?? ""));
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!title) return { error: "제목을 입력하세요." };
  if (!url) return { error: "링크를 입력하세요." };

  const { error } = await supabase
    .from("ai_tools")
    .update({ title, url, description, updated_at: new Date().toISOString() })
    .eq("id", toolId);
  if (error) return { error: `수정 실패: ${error.message}` };

  revalidatePath(PATH);
  return undefined;
}

export async function deleteAiTool(toolId: string): Promise<void> {
  const { supabase, user } = await requireAuthedClient();

  if (!(await canModifyTool(supabase, user.id, toolId))) return;

  await supabase.from("ai_tools").delete().eq("id", toolId);
  revalidatePath(PATH);
}
