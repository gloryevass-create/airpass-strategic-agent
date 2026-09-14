import "@/components/industryTheme.css";
import Link from "next/link";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getMemos } from "@/lib/queries/memos";

const CATEGORY_LABEL: Record<string, string> = {
  business: "SI Business",
  cooperation: "Cooperation",
  marketing: "Marketing",
  etc: "etc",
};

export default async function MemosPage() {
  const { supabase } = await requireAuthedClient();
  const memos = await getMemos(supabase);

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1100, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-2)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="8" y="2" width="8" height="4" rx="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <path d="M9 12h6" />
              <path d="M9 16h6" />
            </svg>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>Memo Board</h1>
          </div>
          <p style={{ margin: "var(--space-2) 0 0", opacity: 0.65, fontSize: 13 }}>
            업무별 의견이나 결정사항들을 기록합니다.
          </p>
        </div>
        <Link href="/dashboard/memos/new" className="btn btn-primary blueprint">
          새 메모 작성
        </Link>
      </div>

      <div style={{ overflowX: "auto" }}>
      <table className="table list-table" style={{ marginTop: "var(--space-6)" }}>
        <thead>
          <tr>
            <th style={{ width: 120 }}>구분</th>
            <th>제목</th>
            <th style={{ width: 160 }}>작성자</th>
            <th style={{ width: 180 }}>작성일</th>
            <th style={{ width: 80 }}>댓글</th>
          </tr>
        </thead>
        <tbody>
          {memos.map((m) => (
            <tr key={m.id} style={{ cursor: "pointer" }}>
              <td>
                <span className="tag tag-outline">{CATEGORY_LABEL[m.category] ?? m.category}</span>
              </td>
              <td className="list-cell-title" style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>
                <Link
                  href={`/dashboard/memos/${m.id}`}
                  style={{ color: "inherit", textDecoration: "none", display: "block" }}
                >
                  {m.title}
                  {m.attachmentCount > 0 && (
                    <span className="text-muted" style={{ marginLeft: 8, fontSize: 12, fontWeight: 400 }}>
                      📎{m.attachmentCount}
                    </span>
                  )}
                </Link>
              </td>
              <td className="text-muted" data-label="작성자">{m.authorEmail}</td>
              <td className="text-muted" data-label="작성일">
                {new Date(m.createdAt).toLocaleString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Seoul",
                })}
              </td>
              <td data-label="댓글">{m.commentCount}</td>
            </tr>
          ))}
          {memos.length === 0 && (
            <tr className="list-empty-row">
              <td colSpan={5} className="text-muted" style={{ textAlign: "center", padding: "var(--space-6) 0" }}>
                아직 등록된 메모가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}
