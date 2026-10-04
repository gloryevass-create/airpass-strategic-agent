import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { formatMember } from "@/lib/formatMember";

type Client = SupabaseClient<Database>;

export type MemoCategory = "business" | "cooperation" | "marketing" | "etc";

export type MemoListItem = {
  id: string;
  authorEmail: string;
  category: MemoCategory;
  title: string;
  createdAt: string;
  commentCount: number;
  attachmentCount: number;
};

/** author_id -> "이름(직함)" 표시용 맵. 메모/댓글은 author_email을 그대로 저장하지만
 * (레거시 데이터 호환), 화면 표시는 profiles.name/title이 있으면 우선한다. */
async function fetchAuthorDisplayById(supabase: Client): Promise<Map<string, string>> {
  const { data: profiles } = await supabase.from("profiles").select("id, email, name, title");
  const map = new Map<string, string>();
  for (const p of profiles ?? []) {
    map.set(p.id, formatMember(p.name, p.title, p.email));
  }
  return map;
}

export async function getMemos(supabase: Client): Promise<MemoListItem[]> {
  const [{ data: memos }, { data: comments }, { data: attachments }, authorDisplayById] = await Promise.all([
    supabase.from("ad_strategy_memos").select("*").order("created_at", { ascending: false }),
    supabase.from("ad_strategy_memo_comments").select("memo_id"),
    supabase.from("ad_strategy_memo_attachments").select("memo_id"),
    fetchAuthorDisplayById(supabase),
  ]);

  const commentCountByMemo = new Map<string, number>();
  for (const c of comments ?? []) {
    commentCountByMemo.set(c.memo_id, (commentCountByMemo.get(c.memo_id) ?? 0) + 1);
  }
  const attachmentCountByMemo = new Map<string, number>();
  for (const a of attachments ?? []) {
    attachmentCountByMemo.set(a.memo_id, (attachmentCountByMemo.get(a.memo_id) ?? 0) + 1);
  }

  return (memos ?? []).map((m) => ({
    id: m.id,
    authorEmail: authorDisplayById.get(m.author_id) ?? m.author_email,
    category: m.category,
    title: m.title,
    createdAt: m.created_at,
    commentCount: commentCountByMemo.get(m.id) ?? 0,
    attachmentCount: attachmentCountByMemo.get(m.id) ?? 0,
  }));
}

export type MemoDetail = {
  id: string;
  authorId: string;
  authorEmail: string;
  category: MemoCategory;
  title: string;
  content: string;
  createdAt: string;
  attachments: {
    id: string;
    fileName: string;
    storagePath: string | null;
    driveFileId: string | null;
    fileSize: number | null;
  }[];
  comments: { id: string; authorId: string; authorEmail: string; content: string; createdAt: string }[];
};

export async function getMemoDetail(supabase: Client, id: string): Promise<MemoDetail | null> {
  const [{ data: memo }, { data: attachments }, { data: comments }, authorDisplayById] = await Promise.all([
    supabase.from("ad_strategy_memos").select("*").eq("id", id).maybeSingle(),
    supabase.from("ad_strategy_memo_attachments").select("*").eq("memo_id", id),
    supabase
      .from("ad_strategy_memo_comments")
      .select("*")
      .eq("memo_id", id)
      .order("created_at", { ascending: true }),
    fetchAuthorDisplayById(supabase),
  ]);

  if (!memo) return null;

  return {
    id: memo.id,
    authorId: memo.author_id,
    authorEmail: authorDisplayById.get(memo.author_id) ?? memo.author_email,
    category: memo.category,
    title: memo.title,
    content: memo.content,
    createdAt: memo.created_at,
    attachments: (attachments ?? []).map((a) => ({
      id: a.id,
      fileName: a.file_name,
      storagePath: a.storage_path,
      driveFileId: a.drive_file_id,
      fileSize: a.file_size,
    })),
    comments: (comments ?? []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorEmail: authorDisplayById.get(c.author_id) ?? c.author_email,
      content: c.content,
      createdAt: c.created_at,
    })),
  };
}
