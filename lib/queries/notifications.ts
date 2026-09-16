import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Client = SupabaseClient<Database>;

export type NotificationType =
  | "event"
  | "business"
  | "youtube"
  | "budget_low"
  | "memo"
  | "budget_scrap"
  | "prespec_scrap"
  | "news_scrap"
  | "cooperation"
  | "marketing"
  | "quotation"
  | "meeting_note"
  | "ai_review"
  | "ai_tool"
  | "work_journal"
  | "material_email";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  link: string | null;
  createdAt: string;
  isRead: boolean;
};

const NOTIFICATION_DISPLAY_LIMIT = 30;

/** 최근 알림 목록 + 이 사용자의 읽음 여부. notification_reads는 사용자별로 따로
 * 관리되므로(팀원마다 안읽음 배지가 다르게 보임), 이 사용자의 읽음 기록만 조회해
 * 조인한다. */
export async function getNotifications(supabase: Client, userId: string): Promise<Notification[]> {
  const [{ data: notifications }, { data: reads }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_DISPLAY_LIMIT),
    supabase.from("notification_reads").select("notification_id").eq("user_id", userId),
  ]);

  const readIds = new Set((reads ?? []).map((r) => r.notification_id));

  return (notifications ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    createdAt: n.created_at,
    isRead: readIds.has(n.id),
  }));
}
