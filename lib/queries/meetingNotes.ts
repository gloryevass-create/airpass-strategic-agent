import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { formatMember } from "@/lib/formatMember";

type Client = SupabaseClient<Database>;

export type MeetingNoteListItem = {
  id: string;
  title: string;
  authorDisplay: string;
  meetingDate: string | null;
  createdAt: string;
};

export type MeetingNoteComment = {
  id: string;
  authorId: string;
  authorDisplay: string;
  content: string;
  createdAt: string;
};

export type MeetingNoteDetail = {
  id: string;
  authorId: string;
  authorDisplay: string;
  title: string;
  meetingDate: string | null;
  attendees: string | null;
  location: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  comments: MeetingNoteComment[];
};

/** author_id -> "이름(직함)" 표시용 맵 — ad_strategy_memos(lib/queries/memos.ts)와
 * 같은 패턴. RLS상 본인 프로필만 보이는 사용자는 다른 사람 이름 대신 author_email로
 * 대체 표시된다(기존 Memo Board와 동일한 제약, 새로 만든 문제 아님). */
async function fetchAuthorDisplayById(supabase: Client): Promise<Map<string, string>> {
  const { data: profiles } = await supabase.from("profiles").select("id, email, name, title");
  const map = new Map<string, string>();
  for (const p of profiles ?? []) {
    map.set(p.id, formatMember(p.name, p.title, p.email));
  }
  return map;
}

export async function getMeetingNotes(supabase: Client): Promise<MeetingNoteListItem[]> {
  const [{ data: notes }, authorDisplayById] = await Promise.all([
    supabase
      .from("meeting_notes")
      .select("id, author_id, author_email, title, meeting_date, created_at")
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    fetchAuthorDisplayById(supabase),
  ]);

  return (notes ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    authorDisplay: authorDisplayById.get(n.author_id) ?? n.author_email,
    meetingDate: n.meeting_date,
    createdAt: n.created_at,
  }));
}

export async function getMeetingNoteDetail(supabase: Client, id: string): Promise<MeetingNoteDetail | null> {
  const [{ data: note }, { data: comments }, authorDisplayById] = await Promise.all([
    supabase.from("meeting_notes").select("*").eq("id", id).maybeSingle(),
    supabase.from("meeting_note_comments").select("*").eq("note_id", id).order("created_at", { ascending: true }),
    fetchAuthorDisplayById(supabase),
  ]);
  if (!note) return null;

  return {
    id: note.id,
    authorId: note.author_id,
    authorDisplay: authorDisplayById.get(note.author_id) ?? note.author_email,
    title: note.title,
    meetingDate: note.meeting_date,
    attendees: note.attendees,
    location: note.location,
    content: note.content,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    comments: (comments ?? []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorDisplay: authorDisplayById.get(c.author_id) ?? c.author_email,
      content: c.content,
      createdAt: c.created_at,
    })),
  };
}
