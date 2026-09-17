import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { formatMember } from "@/lib/formatMember";
import { resolveHistoryAttachmentUrls, type HistoryAttachment } from "@/lib/historyAttachments";
import { requireAuthedClient } from "@/lib/supabase/authed";

type Client = SupabaseClient<Database>;

export type BusinessProjectV2Comment = {
  id: string;
  authorEmail: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
};

export type BusinessProjectV2HistoryEntry = {
  id: string;
  authorEmail: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isOwn: boolean;
  attachments: HistoryAttachment[];
};

export type BusinessProjectV2 = {
  id: string;
  title: string;
  stage: string | null;
  status: string;
  orgName: string | null;
  participationType: string | null;
  workType: string | null;
  result: string | null;
  amount: number | null;
  progressRate: number | null;
  submissionDate: string | null;
  submissionDateIsDatetime: boolean;
  submissionMethod: string | null;
  presentationDate: string | null;
  presentationDateIsDatetime: boolean;
  constructionStart: string | null;
  constructionEnd: string | null;
  constructionContent: string | null;
  assignees: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  comments: BusinessProjectV2Comment[];
  history: BusinessProjectV2HistoryEntry[];
  isFavorite: boolean;
};

/** author_id -> "이름(직함)" 표시용 맵(광고전략메모와 동일한 패턴). */
async function fetchAuthorDisplayById(supabase: Client): Promise<Map<string, string>> {
  const { data: profiles } = await supabase.from("profiles").select("id, email, name, title");
  const map = new Map<string, string>();
  for (const p of profiles ?? []) {
    map.set(p.id, formatMember(p.name, p.title, p.email));
  }
  return map;
}

// business_projects_v2는 이 대시보드가 직접 쓰는(Notion 연동 없는) 사업 관리
// 데이터라 admin 캐싱 없이 요청자의 세션 클라이언트로 매번 최신값을 읽는다
// (product_catalog/partner_vendors와 동일한 패턴).
export async function getBusinessProjectsV2(supabase: Client): Promise<BusinessProjectV2[]> {
  // 즐겨찾기(본인 것만)를 읽으려고 사용자 id가 필요한데, 예전엔 여기서
  // supabase.auth.getUser()를 한 번 더 불렀다 — 이건 로컬 토큰 디코딩이 아니라
  // Supabase Auth 서버 왕복이라(실측 56~150ms), 이미 인증을 마친 페이지가
  // 부르는 함수에서 같은 검증을 또 기다리는 셈이었다(2026-09-17). 요청당 한 번만
  // 실제로 검증하는 requireAuthedClient()(React cache로 감쌈)를 쓰면 이 호출은
  // 같은 요청 안에서 이미 끝난 결과를 그대로 받는다.
  const { user } = await requireAuthedClient();

  const [{ data }, { data: comments }, { data: history }, { data: attachments }, authorDisplayById, { data: favorites }] =
    await Promise.all([
      // 수정(단계 이동 포함)한 사업이 칸반 보드 맨 위로 오도록 생성일이 아니라
      // 최근 수정일 기준 최신순으로 정렬한다(사용자 확인, 2026-08-23).
      supabase.from("business_projects_v2").select("*").order("updated_at", { ascending: false }),
      supabase
        .from("business_projects_v2_comments")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase
        .from("business_projects_v2_history")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase.from("business_projects_v2_history_attachments").select("*"),
      fetchAuthorDisplayById(supabase),
      // 즐겨찾기는 제품 카탈로그(0034)와 같은 방식 — 팀 공유 목록은 그대로 두고
      // 로그인한 본인 즐겨찾기만 조회한다(2026-09-12, Business 칸반·리스트 적용).
      supabase.from("business_projects_v2_favorites").select("project_id").eq("user_id", user.id),
    ]);

  const favoriteIds = new Set((favorites ?? []).map((f) => f.project_id));

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

  const commentsByProject = new Map<string, BusinessProjectV2Comment[]>();
  for (const c of comments ?? []) {
    const list = commentsByProject.get(c.project_id) ?? [];
    list.push({
      id: c.id,
      authorEmail: authorDisplayById.get(c.author_id) ?? c.author_email,
      content: c.content,
      createdAt: c.created_at,
      isOwn: c.author_id === user?.id,
    });
    commentsByProject.set(c.project_id, list);
  }

  const historyByProject = new Map<string, BusinessProjectV2HistoryEntry[]>();
  for (const h of history ?? []) {
    const list = historyByProject.get(h.project_id) ?? [];
    list.push({
      id: h.id,
      authorEmail: authorDisplayById.get(h.author_id) ?? h.author_email,
      content: h.content,
      createdAt: h.created_at,
      updatedAt: h.updated_at,
      isOwn: h.author_id === user?.id,
      attachments: attachmentsByHistory.get(h.id) ?? [],
    });
    historyByProject.set(h.project_id, list);
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    stage: p.stage,
    status: p.status,
    orgName: p.org_name,
    participationType: p.participation_type,
    workType: p.work_type,
    result: p.result,
    amount: p.amount != null ? Number(p.amount) : null,
    progressRate: p.progress_rate != null ? Number(p.progress_rate) : null,
    submissionDate: p.submission_date,
    submissionDateIsDatetime: p.submission_date_is_datetime,
    submissionMethod: p.submission_method,
    presentationDate: p.presentation_date,
    presentationDateIsDatetime: p.presentation_date_is_datetime,
    constructionStart: p.construction_start,
    constructionEnd: p.construction_end,
    constructionContent: p.construction_content,
    assignees: p.assignees,
    notes: p.notes,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    comments: commentsByProject.get(p.id) ?? [],
    history: historyByProject.get(p.id) ?? [],
    isFavorite: favoriteIds.has(p.id),
  }));
}
