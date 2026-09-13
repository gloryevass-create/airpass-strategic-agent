import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Client = SupabaseClient<Database>;

export type PersonalApiToken = {
  id: string;
  label: string | null;
  tokenPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
};

// 회원정보 수정 화면에 발급된 토큰 목록만 보여주기 위한 조회 — 해시도 절대
// 클라이언트로 내려보내지 않는다(미리보기 문자열만).
export async function getMyApiTokens(supabase: Client, userId: string): Promise<PersonalApiToken[]> {
  const { data } = await supabase
    .from("personal_api_tokens")
    .select("id, label, token_preview, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    tokenPreview: t.token_preview,
    createdAt: t.created_at,
    lastUsedAt: t.last_used_at,
  }));
}
