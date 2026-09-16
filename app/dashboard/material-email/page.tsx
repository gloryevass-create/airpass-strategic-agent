import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getMaterialEmailLogs } from "@/lib/queries/materialEmailLogs";
import { getQuotationSummaries } from "@/lib/queries/quotations";
import { isGoogleDriveConfigured, listMaterialFiles } from "@/lib/googleDriveMaterials";
import { isMaterialEmailConfigured } from "@/lib/materialEmail";
import { matchProductMaterialFiles } from "@/lib/materialEmailTemplate";
import { MaterialEmailForm } from "@/components/dashboard/MaterialEmailForm";
import { SentMaterialEmailPreviewButton } from "@/components/dashboard/SentMaterialEmailPreviewButton";
import { DeleteIconButton } from "@/components/DeleteIconButton";
import { deleteMaterialEmailLog } from "@/app/dashboard/actions/materialEmail";

// 서버 컴포넌트(Vercel UTC 런타임)라 timeZone을 명시하지 않으면 실제 한국시간보다
// 9시간 느리게 표시된다(2026-09-03 관리자 페이지 로그인 기록에서 신고).
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div style={{ maxWidth: 560, border: "1px solid var(--color-divider)", background: "var(--color-accent-100)", padding: "var(--space-6)", fontSize: 13, color: "var(--color-accent-900)" }}>
      <h2 style={{ margin: "0 0 var(--space-2)", fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600 }}>
        자료메일발송 설정이 아직 끝나지 않았습니다
      </h2>
      <p style={{ margin: "0 0 var(--space-2)" }}>다음 환경변수가 설정돼야 이 기능을 쓸 수 있습니다:</p>
      <ul style={{ margin: "0 0 var(--space-2)", paddingLeft: 20 }}>
        {missing.map((m) => (
          <li key={m}>
            <code style={{ background: "var(--color-accent-200)", padding: "1px 4px" }}>{m}</code>
          </li>
        ))}
      </ul>
      <p style={{ margin: 0 }}>자세한 발급·설정 절차는 README.md를 참고하세요.</p>
    </div>
  );
}

export default async function MaterialEmailPage() {
  const { supabase } = await requireAuthedClient();

  const missing = [
    ...(isGoogleDriveConfigured
      ? []
      : ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_DRIVE_MATERIALS_FOLDER_ID"]),
    ...(isMaterialEmailConfigured
      ? []
      : [
          "MATERIAL_EMAIL_SMTP_HOST",
          "MATERIAL_EMAIL_SMTP_PORT",
          "MATERIAL_EMAIL_SMTP_USER",
          "MATERIAL_EMAIL_SMTP_PASSWORD",
        ]),
  ];

  const [logs, quotations, profile] = await Promise.all([
    getMaterialEmailLogs(supabase),
    getQuotationSummaries(supabase),
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("name, title, email, phone, role").eq("id", user.id).single();
      return data;
    }),
  ]);

  const isAdmin = profile?.role === "admin";

  const files = missing.length === 0 ? await listMaterialFiles() : [];
  const productLinkLabels = matchProductMaterialFiles(files).map(({ label, fileId }) => ({
    label,
    matched: fileId != null,
  }));

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 900, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 6.5L7.9 13a2.5 2.5 0 0 0 3.5 3.5l7-7a4.2 4.2 0 0 0-6-6l-7 7a6 6 0 0 0 8.5 8.5" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>자료메일발송</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        구글드라이브 자료 폴더에서 보낼 자료를 골라 안내 내용과 함께 이메일로 보냅니다. 자료는 실제 첨부가
        아니라 공유 링크로 전달됩니다.
      </p>

      {missing.length > 0 ? (
        <SetupNotice missing={missing} />
      ) : (
        <MaterialEmailForm
          files={files}
          quotations={quotations}
          productLinkLabels={productLinkLabels}
          senderName={profile?.name ?? profile?.email ?? ""}
          senderTitle={profile?.title ?? null}
          senderEmail={profile?.email ?? ""}
          senderPhone={profile?.phone ?? null}
        />
      )}

      <div style={{ marginTop: "var(--space-8)" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v4h4" />
            <path d="M12 8v4l3 2" />
          </svg>
          최근 발송 이력
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {logs.map((l) => (
            <div key={l.id} style={{ border: "1px solid var(--color-divider)", padding: "var(--space-3)", fontSize: 13 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <SentMaterialEmailPreviewButton logId={l.id} subject={l.subject} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-muted" style={{ fontSize: 11 }}>
                    {l.senderEmail} · {formatDateTime(l.createdAt)}
                  </span>
                  {isAdmin && <DeleteIconButton action={deleteMaterialEmailLog.bind(null, l.id)} />}
                </div>
              </div>
              <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 11 }}>
                받는 사람: {l.recipientEmails.join(", ")}
              </p>
              {l.fileNames.length > 0 && (
                <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 11 }}>
                  자료: {l.fileNames.join(", ")}
                </p>
              )}
              {l.quotationQuoteNumber && (
                <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 11 }}>
                  첨부 산출내역: {l.quotationQuoteNumber}
                </p>
              )}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13 }}>
              아직 발송 이력이 없습니다.
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
