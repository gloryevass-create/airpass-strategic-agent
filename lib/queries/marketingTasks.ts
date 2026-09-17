import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { formatMember } from "@/lib/formatMember";
import { resolveHistoryAttachmentUrls, type HistoryAttachment } from "@/lib/historyAttachments";
import { requireAuthedClient } from "@/lib/supabase/authed";

type Client = SupabaseClient<Database>;

export type MarketingTaskComment = {
  id: string;
  authorEmail: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
};

export type MarketingTaskHistoryEntry = {
  id: string;
  authorEmail: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
  attachments: HistoryAttachment[];
};

export type MarketingTask = {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  workType: string | null;
  stage: string | null;
  status: string;
  dueDate: string | null;
  dueDateEnd: string | null;
  dueDateIsDatetime: boolean;
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  comments: MarketingTaskComment[];
  history: MarketingTaskHistoryEntry[];
  isFavorite: boolean;
};

/** author_id -> "이름(직함)" 표시용 맵(광고전략메모/SI Business/협업과 동일한 패턴). */
async function fetchAuthorDisplayById(supabase: Client): Promise<Map<string, string>> {
  const { data: profiles } = await supabase.from("profiles").select("id, email, name, title");
  const map = new Map<string, string>();
  for (const p of profiles ?? []) {
    map.set(p.id, formatMember(p.name, p.title, p.email));
  }
  return map;
}

// marketing_tasks는 이 대시보드가 직접 쓰는(Notion 연동 없는) 마케팅 업무
// 데이터라 admin 캐싱 없이 요청자의 세션 클라이언트로 매번 최신값을 읽는다
// (product_catalog/business_projects_v2/cooperation_projects와 동일한 패턴).
export async function getMarketingTasks(supabase: Client): Promise<MarketingTask[]> {
  // 즐겨찾기(본인 것만)를 읽으려고 사용자 id가 필요한데, 예전엔 여기서
  // supabase.auth.getUser()를 한 번 더 불렀다 — 이건 로컬 토큰 디코딩이 아니라
  // Supabase Auth 서버 왕복이라(실측 56~150ms), 이미 인증을 마친 페이지가
  // 부르는 함수에서 같은 검증을 또 기다리는 셈이었다(2026-09-17). 요청당 한 번만
  // 실제로 검증하는 requireAuthedClient()(React cache로 감쌈)를 쓰면 이 호출은
  // 같은 요청 안에서 이미 끝난 결과를 그대로 받는다.
  const { user } = await requireAuthedClient();

  const [{ data }, { data: comments }, { data: history }, { data: attachments }, authorDisplayById, { data: favorites }] =
    await Promise.all([
      // 수정(분류 이동 포함)한 업무가 칸반 보드 맨 위로 오도록 생성일이 아니라
      // 최근 수정일 기준 최신순으로 정렬한다(SI Business와 동일, 사용자 확인 2026-08-23).
      supabase.from("marketing_tasks").select("*").order("updated_at", { ascending: false }),
      supabase
        .from("marketing_tasks_comments")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("marketing_tasks_history")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase.from("marketing_tasks_history_attachments").select("*"),
      fetchAuthorDisplayById(supabase),
      // 즐겨찾기는 SI Business(0072)와 동일한 방식(2026-09-12).
      supabase.from("marketing_tasks_favorites").select("task_id").eq("user_id", user.id),
    ]);

  const favoriteIds = new Set((favorites ?? []).map((f) => f.task_id));

  const urlByAttachmentId = await resolveHistoryAttachmentUrls(
    supabase,
    (attachments ?? []).map((a) => ({ id: a.id, storagePath: a.storage_path, driveFileId: a.drive_file_id }))
  );
  const attachmentsByHistory = new Map<string, HistoryAttachment[]>();
  for (const a of attachments ?? []) {
    const list = attachmentsByHistory.get(a.history_id) ?? [];
    list.push({ id: a.id, fileName: a.file_name, url: urlByAttachmentId.get(a.id) ?? null });
    attachmentsByHistory.set(a.history_id, list);
  }

  const commentsByTask = new Map<string, MarketingTaskComment[]>();
  for (const c of comments ?? []) {
    const list = commentsByTask.get(c.task_id) ?? [];
    list.push({
      id: c.id,
      authorEmail: authorDisplayById.get(c.author_id) ?? c.author_email,
      content: c.content,
      createdAt: c.created_at,
      isOwn: c.author_id === user?.id,
    });
    commentsByTask.set(c.task_id, list);
  }

  const historyByTask = new Map<string, MarketingTaskHistoryEntry[]>();
  for (const h of history ?? []) {
    const list = historyByTask.get(h.task_id) ?? [];
    list.push({
      id: h.id,
      authorEmail: authorDisplayById.get(h.author_id) ?? h.author_email,
      content: h.content,
      createdAt: h.created_at,
      updatedAt: h.updated_at,
      isOwn: h.author_id === user?.id,
      attachments: attachmentsByHistory.get(h.id) ?? [],
    });
    historyByTask.set(h.task_id, list);
  }

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    content: t.content,
    category: t.category,
    workType: t.work_type,
    stage: t.stage,
    status: t.status,
    dueDate: t.due_date,
    dueDateEnd: t.due_date_end,
    dueDateIsDatetime: t.due_date_is_datetime,
    assignees: t.assignees,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    comments: commentsByTask.get(t.id) ?? [],
    history: historyByTask.get(t.id) ?? [],
    isFavorite: favoriteIds.has(t.id),
  }));
}
