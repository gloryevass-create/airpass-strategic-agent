import "@/components/industryTheme.css";
import { requireAdminClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import { RegisterUserForm } from "@/components/RegisterUserForm";

// 서버 컴포넌트라 Vercel 런타임(UTC)에서 렌더링된다 — timeZone을 명시하지 않으면
// "ko-KR" 로케일 표기 형식은 한글이어도 시각 자체는 UTC라 실제 한국시간보다
// 9시간 느리게 보인다(2026-09-03 사용자 신고로 발견).
function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// Claude Design "관리자 페이지 디자인" 목업을 페이지 전체(등록 폼 + 가입자 목록 표)에
// 적용했다(2026-08-29) — 처음에는 표만 기존 Tailwind 스타일로 남겨뒀는데, 두 스타일이
// 섞이면서 레이아웃이 깨지는 문제가 있어(등록 폼 영역의 min-height:100vh가 표를 화면
// 밖으로 밀어냄) 전체를 하나의 .industry-theme로 통일했다(사용자 확인).
type SearchParams = Promise<{ driveUploadConnected?: string; driveUploadError?: string }>;

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireAdminClient();
  const { driveUploadConnected, driveUploadError } = await searchParams;

  // 두 조회는 서로 무관하니 나란히 보낸다(2026-09-17).
  // google_drive_upload_connection은 RLS 정책이 없어(service_role만 접근) admin
  // 클라이언트로 조회해야 한다 — 다른 테이블처럼 세션 클라이언트로는 항상 빈 결과다.
  const [{ data: profiles }, { data: driveConnection }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    createAdminClient()
      .from("google_drive_upload_connection")
      .select("google_email, connected_at")
      .eq("id", true)
      .maybeSingle(),
  ]);

  return (
    <div className="industry-theme board-page-content" style={{ padding: "var(--space-8) var(--space-6)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v5.5c0 4.5-3 7.7-7 9.5-4-1.8-7-5-7-9.5V6z" />
            <path d="M9 12l2 2 4-4.5" />
          </svg>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 28, margin: 0, color: "var(--color-accent-700)" }}>관리자 — 팀원 등록</h1>
        </div>
        <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-8)", fontSize: 13 }}>
          공개 회원가입은 꺼져 있습니다. 여기서 계정을 등록하면 즉시 로그인할 수 있습니다.
        </p>

        <RegisterUserForm />

        <div style={{ marginTop: "var(--space-9)" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55, margin: "0 0 var(--space-3)" }}>
            첨부파일 업로드용 구글드라이브 연결
          </p>
          {driveUploadConnected && (
            <p style={{ fontSize: 12, color: "var(--color-accent-700)", margin: "0 0 var(--space-2)" }}>
              연결되었습니다.
            </p>
          )}
          {driveUploadError && (
            <p style={{ fontSize: 12, color: "var(--color-danger, #b3261e)", margin: "0 0 var(--space-2)" }}>
              연결에 실패했습니다({driveUploadError}). 다시 시도해 주세요.
            </p>
          )}
          <div
            style={{
              border: "1px solid var(--color-divider)",
              padding: "var(--space-4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-4)",
              flexWrap: "wrap",
              maxWidth: 560,
            }}
          >
            <div style={{ fontSize: 13 }}>
              {driveConnection ? (
                <>
                  <div>연결된 계정: <strong>{driveConnection.google_email}</strong></div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                    Work Journal·Memo Board·제조사 관리 첨부파일이 이 계정의 구글드라이브로 올라갑니다.
                  </div>
                </>
              ) : (
                <>
                  <div>아직 연결되지 않았습니다.</div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                    연결 전까지는 첨부파일이 Supabase Storage로 업로드됩니다.
                  </div>
                </>
              )}
            </div>
            <a href="/auth/google-drive-upload/connect" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
              {driveConnection ? "다시 연결" : "연결하기"}
            </a>
          </div>
        </div>

        <div style={{ marginTop: "var(--space-9)" }}>
          <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.55, margin: "0 0 var(--space-3)" }}>
            가입자 목록
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>직함</th>
                  <th>회사메일</th>
                  <th>구글메일</th>
                  <th>핸드폰번호</th>
                  <th>역할</th>
                  <th>가입일</th>
                  <th>최근 로그인</th>
                  <th>접속 IP</th>
                </tr>
              </thead>
              <tbody>
                {(profiles ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name ?? "-"}</td>
                    <td className="text-muted">{p.title ?? "-"}</td>
                    <td className="text-muted">{p.email}</td>
                    <td className="text-muted">{p.google_email ?? "-"}</td>
                    <td className="text-muted">{p.phone ?? "-"}</td>
                    <td>
                      <span
                        className={
                          p.role === "admin" ? "tag tag-accent" : p.role === "guest" ? "tag tag-neutral" : "tag tag-outline"
                        }
                      >
                        {p.role}
                      </span>
                    </td>
                    <td className="text-muted">{new Date(p.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                    <td className="text-muted">{formatDateTime(p.last_login_at)}</td>
                    <td className="text-muted">{p.last_login_ip ?? "-"}</td>
                  </tr>
                ))}
                {(!profiles || profiles.length === 0) && (
                  <tr>
                    <td colSpan={9} className="text-muted" style={{ textAlign: "center", padding: "var(--space-6)" }}>
                      아직 가입자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
