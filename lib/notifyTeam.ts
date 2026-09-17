import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMember } from "@/lib/formatMember";
import type { Database } from "@/lib/types/database.types";

type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];

/** 팀 알림(알림벨 + 브라우저 푸시)을 **응답을 돌려준 뒤에** 남긴다(2026-09-17).
 *
 * 원래는 게시판마다 저장 직후 `profiles`에서 작성자 이름을 읽고 `notifications`에
 * insert하는 코드가 똑같이 복붙돼 있었는데, 그 두 번의 왕복이 전부 "저장" 버튼을
 * 누른 사람의 대기 시간에 포함돼 있었다(실측: Supabase 왕복 1회 80~250ms — 즉
 * 알림 하나 남기려고 매번 0.2~0.9초를 더 기다렸다). 알림은 저장 성공/실패와
 * 무관한 사후 통보라 Next 16의 after()로 응답 이후로 미룬다 — 화면 갱신은 즉시
 * 되고, 알림벨은 Realtime/30초 폴링으로 어차피 조금 뒤에 받아가므로 체감 차이가
 * 없다(푸시도 5분 주기 크론이 큐를 비우는 구조라 영향 없음).
 *
 * after() 안에서는 응답이 끝나 세션 쿠키를 다시 쓸 수 없으므로(@supabase/ssr가
 * 갱신 토큰을 기록할 수 없다) service_role 클라이언트를 쓴다 — 알림 내용은
 * 전부 서버가 만들고, "누가" 남기는지는 응답 전에 확인이 끝난 user.id로만
 * 판단하므로 권한이 느슨해지지는 않는다.
 *
 * 실패해도 조용히 콘솔에만 남긴다 — 이 시점엔 사용자에게 알려줄 방법이 없고,
 * 알림이 안 떠도 항목 자체는 이미 정상 저장됐기 때문. */
export function notifyTeamAfterResponse(
  user: { id: string; email?: string | null },
  /** 작성자 표시 이름("이름(직함)" 또는 이메일)을 받아 알림 한 건을 만든다. */
  build: (actor: string) => NotificationInsert
): void {
  after(async () => {
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin.from("profiles").select("name, email").eq("id", user.id).single();
      const actor = formatMember(profile?.name ?? null, null, profile?.email ?? user.email ?? "");
      const { error } = await admin.from("notifications").insert(build(actor));
      if (error) console.error("[notifyTeamAfterResponse] 알림 생성 실패:", error.message);
    } catch (e) {
      console.error("[notifyTeamAfterResponse] 알림 생성 실패:", e instanceof Error ? e.message : e);
    }
  });
}

/** 작성자 표시 이름을 이미 알고 있을 때(예: 산출내역은 `created_by_name` 컬럼에
 * 넣으려고 저장 전에 이미 `profiles`를 읽는다) `profiles`를 한 번 더 읽지 않는 버전. */
export function notifyTeamAfterResponseAs(notification: NotificationInsert): void {
  after(async () => {
    try {
      const { error } = await createAdminClient().from("notifications").insert(notification);
      if (error) console.error("[notifyTeamAfterResponseAs] 알림 생성 실패:", error.message);
    } catch (e) {
      console.error("[notifyTeamAfterResponseAs] 알림 생성 실패:", e instanceof Error ? e.message : e);
    }
  });
}
