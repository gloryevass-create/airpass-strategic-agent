import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { formatMember } from "@/lib/formatMember";

type Client = SupabaseClient<Database>;

export type AiReviewListItem = {
  id: string;
  title: string;
  authorDisplay: string;
  createdAt: string;
};

export type AiReviewComment = {
  id: string;
  authorId: string;
  authorDisplay: string;
  content: string;
  createdAt: string;
};

export type AiReviewDetail = {
  id: string;
  authorId: string;
  authorDisplay: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  comments: AiReviewComment[];
};

/** author_id -> "이름(직함)" 표시용 맵 — Meeting Notes(lib/queries/meetingNotes.ts)와
 * 같은 패턴. */
async function fetchAuthorDisplayById(supabase: Client): Promise<Map<string, string>> {
  const { data: profiles } = await supabase.from("profiles").select("id, email, name, title");
  const map = new Map<string, string>();
  for (const p of profiles ?? []) {
    map.set(p.id, formatMember(p.name, p.title, p.email));
  }
  return map;
}

export async function getAiReviews(supabase: Client): Promise<AiReviewListItem[]> {
  const [{ data: reviews }, authorDisplayById] = await Promise.all([
    supabase.from("ai_reviews").select("id, author_id, author_email, title, created_at").order("created_at", { ascending: false }),
    fetchAuthorDisplayById(supabase),
  ]);

  return (reviews ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    authorDisplay: authorDisplayById.get(r.author_id) ?? r.author_email,
    createdAt: r.created_at,
  }));
}

export async function getAiReviewDetail(supabase: Client, id: string): Promise<AiReviewDetail | null> {
  const [{ data: review }, { data: comments }, authorDisplayById] = await Promise.all([
    supabase.from("ai_reviews").select("*").eq("id", id).maybeSingle(),
    supabase.from("ai_review_comments").select("*").eq("review_id", id).order("created_at", { ascending: true }),
    fetchAuthorDisplayById(supabase),
  ]);
  if (!review) return null;

  return {
    id: review.id,
    authorId: review.author_id,
    authorDisplay: authorDisplayById.get(review.author_id) ?? review.author_email,
    title: review.title,
    content: review.content,
    createdAt: review.created_at,
    updatedAt: review.updated_at,
    comments: (comments ?? []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorDisplay: authorDisplayById.get(c.author_id) ?? c.author_email,
      content: c.content,
      createdAt: c.created_at,
    })),
  };
}
