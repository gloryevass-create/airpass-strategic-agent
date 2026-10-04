import "@/components/industryTheme.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getMeetingNoteDetail } from "@/lib/queries/meetingNotes";
import { deleteMeetingNote } from "@/app/dashboard/actions/meetingNotes";
import { DeleteMemoButton } from "@/components/DeleteMemoButton";
import { MarkdownContent, extractHeadings } from "@/components/dashboard/MarkdownContent";
import { MeetingNoteCommentForm } from "@/components/MeetingNoteCommentForm";
import { CommentDeleteButton } from "@/components/CommentDeleteButton";
import { deleteMeetingNoteComment } from "@/app/dashboard/actions/meetingNotes";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

type Params = Promise<{ id: string }>;

export default async function MeetingNoteDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { supabase, user } = await requireAuthedClient();

  const note = await getMeetingNoteDetail(supabase, id);
  if (!note) notFound();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const canModify = note.authorId === user.id || profile?.role === "admin";

  const headings = extractHeadings(note.content);

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1180, margin: 0 }}>
      <Link
        href="/dashboard/meeting-notes"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--color-accent-700)",
          fontSize: 13,
          textDecoration: "none",
          marginBottom: "var(--space-5)",
        }}
      >
        ← 목록으로
      </Link>

      <div className="meeting-note-detail-row" style={{ display: "flex", gap: "var(--space-8)", alignItems: "flex-start" }}>
        <div className="card blueprint elev-sm" style={{ flex: 1, minWidth: 0, padding: "var(--space-6) var(--space-8)", background: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, margin: "0 0 var(--space-2)", color: "var(--color-accent-700)" }}>
              {note.title}
            </h1>
            {canModify && (
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Link href={`/dashboard/meeting-notes/${note.id}/edit`} className="btn btn-secondary blueprint">
                  수정
                </Link>
                <DeleteMemoButton action={deleteMeetingNote.bind(null, note.id)} />
              </div>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: 13, margin: "0 0 var(--space-2)" }}>
            {note.authorDisplay}
            {note.meetingDate && ` · 미팅일 ${formatDate(note.meetingDate)}`}
            {` · 등록 ${formatDate(note.createdAt.slice(0, 10))}`}
          </p>
          {(note.attendees || note.location) && (
            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
              {note.attendees && (
                <span className="tag tag-outline" style={{ fontSize: 12 }}>
                  참석자: {note.attendees}
                </span>
              )}
              {note.location && (
                <span className="tag tag-outline" style={{ fontSize: 12 }}>
                  장소: {note.location}
                </span>
              )}
            </div>
          )}

          <MarkdownContent content={note.content} />

          <div style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--color-divider)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, margin: "0 0 var(--space-4)", display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              의견 {note.comments.length > 0 && `(${note.comments.length})`}
            </h2>
            <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
              {note.comments.map((c) => (
                <div key={c.id} className="card blueprint" style={{ fontSize: 13 }}>
                  <div className="text-muted" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span>
                      {c.authorDisplay} · {formatDateTime(c.createdAt)}
                    </span>
                    {(c.authorId === user.id || profile?.role === "admin") && (
                      <CommentDeleteButton commentId={c.id} action={deleteMeetingNoteComment} />
                    )}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
                </div>
              ))}
              {note.comments.length === 0 && (
                <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                  아직 의견이 없습니다.
                </p>
              )}
            </div>
            <MeetingNoteCommentForm noteId={note.id} />
          </div>
        </div>

        {headings.length > 0 && (
          <nav
            className="meeting-note-toc"
            style={{
              width: 220,
              flexShrink: 0,
              position: "sticky",
              top: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
            }}
          >
            <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55, margin: "0 0 var(--space-1)" }}>
              목차
            </p>
            {headings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                style={{
                  color: "var(--color-accent-700)",
                  textDecoration: "none",
                  paddingLeft: (h.depth - 1) * 10,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {h.text}
              </a>
            ))}
          </nav>
        )}
      </div>
      </div>
    </div>
  );
}
