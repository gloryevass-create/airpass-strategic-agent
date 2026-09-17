import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { createClient } from "./server";
import { isSupabaseConfigured } from "./env";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** 로그인 여부만 확인. 미설정/미로그인이면 /login으로 리다이렉트.
 *
 * `supabase.auth.getUser()`는 로컬 JWT 디코딩이 아니라 **매번 Supabase Auth
 * 서버에 왕복**한다(실측 56~150ms) — 한 화면을 그릴 때 레이아웃
 * (app/dashboard/layout.tsx)과 페이지가 각자 이 함수를 부르고, 일부 쿼리
 * 함수까지 부르면 같은 검증을 한 요청 안에서 두세 번 반복하게 된다. React의
 * cache()로 감싸 **요청당 한 번만** 실제 검증을 하고 나머지는 그 결과를
 * 그대로 받게 했다(2026-09-17) — 검증을 건너뛰거나 약화하는 게 아니라 같은
 * 요청 안에서 중복 호출만 없앤다(요청이 끝나면 캐시도 사라진다). */
export const requireAuthedClient = cache(async () => {
  if (!isSupabaseConfigured) redirect("/login");

  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return { supabase, user: user as User };
});

/** 로그인 + profiles.role === 'admin' 확인. 비관리자는 /dashboard로 리다이렉트. */
export async function requireAdminClient() {
  const { supabase, user } = await requireAuthedClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  return { supabase, user, profile };
}
