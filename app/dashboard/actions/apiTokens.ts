"use server";

import { revalidatePath } from "next/cache";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { generateApiToken } from "@/lib/personalApiToken";

const PATH = "/dashboard/account/profile";

export type ApiTokenState = { error?: string; token?: string } | undefined;

// personal_api_tokens(0074)는 google_calendar_connections(0050)/
// material_email_smtp_accounts(0070)와 같은 이유로 admin(service_role) 없이
// 세션 클라이언트 + self-row RLS로 바로 CRUD한다 — 본인 토큰만 발급/삭제할 수
// 있어 권한상승 위험이 없다. 평문 토큰은 이 응답(state.token)에만 담겨 한 번
// 내려가고, insert 자체는 해시만 저장한다.
export async function createApiToken(
  _prevState: ApiTokenState,
  formData: FormData
): Promise<ApiTokenState> {
  const { supabase, user } = await requireAuthedClient();

  const label = String(formData.get("label") ?? "").trim() || null;
  const { token, hash, preview } = generateApiToken();

  const { error } = await supabase
    .from("personal_api_tokens")
    .insert({ user_id: user.id, label, token_hash: hash, token_preview: preview });
  if (error) return { error: `발급 실패: ${error.message}` };

  revalidatePath(PATH);
  return { token };
}

export async function deleteApiToken(id: string): Promise<void> {
  const { supabase, user } = await requireAuthedClient();
  await supabase.from("personal_api_tokens").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath(PATH);
}
