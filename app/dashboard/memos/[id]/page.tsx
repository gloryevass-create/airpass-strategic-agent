import "@/components/industryTheme.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getMemoDetail } from "@/lib/queries/memos";
import { MemoCommentForm } from "@/components/MemoCommentForm";
import { DeleteMemoButton } from "@/components/DeleteMemoButton";
import { deleteMemo } from "@/app/dashboard/memos/actions";
import { driveFileViewUrl } from "@/lib/googleDriveAttachments";
import { CommentDeleteButton } from "@/components/CommentDeleteButton";
import { deleteMemoComment } from "@/app/dashboard/memos/actions";

const CATEGORY_LABEL: Record<string, string> = {
  business: "SI Business",
  cooperation: "Cooperation",
  marketing: "Marketing",
  etc: "etc",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function formatFileSize(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ attachmentError?: string }>;

export default async function MemoDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { attachmentError } = await searchParams;
  const { supabase, user } = await requireAuthedClient();
  const memo = await getMemoDetail(supabase, id);

  if (!memo) notFound();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const canModify = memo.authorId === user.id || profile?.role === "admin";

  const attachmentsWithUrl = await Promise.all(
    memo.attachments.map(async (a) => {
      if (a.driveFileId) return { ...a, url: driveFileViewUrl(a.driveFileId) };
      if (!a.storagePath) return { ...a, url: null };
      const { data } = await supabase.storage
        .from("memo-attachments")
        .createSignedUrl(a.storagePath, 60 * 60);
      return { ...a, url: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 800, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <Link
          href="/dashboard/memos"
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
        {canModify && (
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Link href={`/dashboard/memos/${memo.id}/edit`} className="btn btn-secondary blueprint">
              수정
            </Link>
            <DeleteMemoButton action={deleteMemo.bind(null, memo.id)} />
          </div>
        )}
      </div>

      {attachmentError === "1" && (
        <p
          style={{
            marginBottom: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid color-mix(in srgb, var(--color-accent-900) 40%, transparent)",
            background: "color-mix(in srgb, var(--color-accent-900) 6%, transparent)",
            padding: "var(--space-2) var(--space-4)",
            fontSize: 13,
            color: "var(--color-accent-900)",
          }}
        >
          일부 첨부파일 업로드에 실패했습니다. 저장은 됐지만 해당 파일은 빠졌습니다 — 수정 화면에서 다시 첨부해주세요.
        </p>
      )}

      <span className="tag tag-outline">{CATEGORY_LABEL[memo.category] ?? memo.category}</span>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 26, margin: "var(--space-3) 0 var(--space-1)" }}>
        {memo.title}
      </h1>
      <p style={{ margin: "0 0 var(--space-5)", opacity: 0.6, fontSize: 13 }}>
        {memo.authorEmail} · {formatDate(memo.createdAt)}
      </p>

      <div className="card blueprint elev-sm" style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>
        {memo.content}
      </div>

      {attachmentsWithUrl.length > 0 && (
        <div style={{ marginTop: "var(--space-6)" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            첨부파일
          </h2>
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", listStyle: "none", margin: 0, padding: 0 }}>
            {attachmentsWithUrl.map((a) => (
              <li key={a.id} style={{ fontSize: 13 }}>
                {a.url ? (
                  <a href={a.url}>📎 {a.fileName}</a>
                ) : (
                  <span className="text-muted">📎 {a.fileName}</span>
                )}
                <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  {formatFileSize(a.fileSize)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, margin: "0 0 var(--space-4)", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          댓글 {memo.comments.length > 0 && `(${memo.comments.length})`}
        </h2>
        <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
          {memo.comments.map((c) => (
            <div key={c.id} className="card blueprint" style={{ fontSize: 13 }}>
              <div className="text-muted" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>
                  {c.authorEmail} · {formatDate(c.createdAt)}
                </span>
                {(c.authorId === user.id || profile?.role === "admin") && (
                  <CommentDeleteButton commentId={c.id} action={deleteMemoComment} />
                )}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div>
            </div>
          ))}
          {memo.comments.length === 0 && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>아직 댓글이 없습니다.</p>}
        </div>
        <MemoCommentForm memoId={memo.id} />
      </div>
      </div>
    </div>
  );
}
