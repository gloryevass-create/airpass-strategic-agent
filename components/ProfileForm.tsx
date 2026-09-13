"use client";

import { useActionState, useState, useTransition, type CSSProperties } from "react";
import { updateOwnProfile, type UpdateProfileState } from "@/app/dashboard/actions/profile";
import {
  saveMaterialEmailSmtpAccount,
  deleteMaterialEmailSmtpAccount,
  type SmtpAccountState,
} from "@/app/dashboard/actions/smtpAccount";
import { createApiToken, deleteApiToken, type ApiTokenState } from "@/app/dashboard/actions/apiTokens";
import type { PersonalApiToken } from "@/lib/queries/apiTokens";
import { FONT_OPTIONS, PRETENDARD_DEFAULT_STACK, type FontPreferenceId } from "@/lib/fontPreferences";

const initialState: UpdateProfileState = undefined;
const initialSmtpState: SmtpAccountState = undefined;
const initialApiTokenState: ApiTokenState = undefined;

const PREVIEW_TEXT = "가나다 ABC 123 — 실제 이 폰트로 보입니다";

function fontStackFor(id: FontPreferenceId): string {
  return FONT_OPTIONS.find((opt) => opt.id === id)?.stack ?? PRETENDARD_DEFAULT_STACK;
}

/** 드롭다운에 적힌 이름만 봐서는 실제 어떤 폰트가 적용된 건지 알 수 없다는
 * 피드백(2026-09-10)으로 추가 — 선택을 바꿀 때마다(저장 전에도) 그 폰트의 실제
 * font-family로 렌더링되는 샘플 문구를 보여준다. */
function FontPreview({ fontId }: { fontId: FontPreferenceId }) {
  return (
    <p style={{ margin: "6px 0 0", fontSize: 13, fontFamily: fontStackFor(fontId) } as CSSProperties}>
      {PREVIEW_TEXT}
    </p>
  );
}

/** 자료메일발송 개인 SMTP 계정 등록/해제(2026-09-13) — 등록해두면 자료메일발송이
 * 공용 계정 대신 이 계정으로 보내고, 비밀번호는 절대 다시 채워 보여주지 않는다
 * (보안 — 서버가 클라이언트로 내려보내지도 않음). updateOwnProfile과는 별개
 * 액션이라 독립된 폼 + 저장 버튼으로 뒀다. */
function SmtpAccountSection({ smtpUser }: { smtpUser: string | null }) {
  const [state, formAction, pending] = useActionState(saveMaterialEmailSmtpAccount, initialSmtpState);
  const [isDeleting, startDelete] = useTransition();

  function handleDelete() {
    if (!window.confirm("본인 SMTP 계정을 삭제하고 공용 계정으로 되돌릴까요?")) return;
    startDelete(async () => {
      await deleteMaterialEmailSmtpAccount();
    });
  }

  return (
    <div style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--color-divider)" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, margin: "0 0 var(--space-2)" }}>자료메일발송 SMTP 계정</h2>
      <p className="text-muted" style={{ fontSize: 12, margin: "0 0 var(--space-4)" }}>
        {smtpUser
          ? `현재 본인 계정(${smtpUser})으로 발송됩니다.`
          : "등록해두면 자료메일발송이 공용 계정 대신 본인 계정으로 보냅니다. 등록하지 않으면 지금처럼 공용 계정으로 발송됩니다."}
        메일 서버(호스트·포트)는 공용과 동일하고, 이메일·비밀번호만 개인별입니다.
      </p>
      <form action={formAction} style={{ maxWidth: 640 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
          <div className="field">
            <label htmlFor="smtpUser">SMTP 계정 이메일</label>
            <input
              className="input"
              id="smtpUser"
              name="smtpUser"
              type="email"
              defaultValue={smtpUser ?? ""}
              placeholder="example@airpass.co.kr"
            />
          </div>
          <div className="field">
            <label htmlFor="smtpPassword">SMTP 비밀번호</label>
            <input
              className="input"
              id="smtpPassword"
              name="smtpPassword"
              type="password"
              placeholder={smtpUser ? "변경하지 않으려면 비워두세요" : "비밀번호 입력"}
              autoComplete="new-password"
            />
          </div>
        </div>
        {state?.error && (
          <p style={{ color: "var(--color-accent-900)", fontSize: 13, marginBottom: "var(--space-3)" }}>{state.error}</p>
        )}
        {state?.success && (
          <p style={{ color: "var(--color-accent-700)", fontSize: 13, marginBottom: "var(--space-3)" }}>저장되었습니다.</p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          {smtpUser && (
            <button type="button" className="btn btn-secondary" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "삭제 중..." : "기본 계정으로 되돌리기"}
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

/** 외부 캘린더 브리핑 API(app/api/calendar-feed/route.ts) 개인 토큰 발급/삭제
 * (2026-09-13) — Claude 등 외부 에이전트가 이 토큰으로 본인 일정(개인 구글
 * 캘린더 + 팀 캘린더)을 읽어갈 수 있다. 평문 토큰은 발급 직후 이 화면에서
 * 딱 한 번만 보여주고(state.token), 이후로는 목록에 미리보기(preview)만
 * 남는다 — 다시 볼 수 없으니 그 자리에서 복사해야 한다. */
function ApiTokenSection({ tokens, baseUrl }: { tokens: PersonalApiToken[]; baseUrl: string }) {
  const [state, formAction, pending] = useActionState(createApiToken, initialApiTokenState);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  function handleDelete(id: string) {
    if (!window.confirm("이 토큰을 삭제할까요? 이 토큰을 쓰던 외부 연결은 더 이상 동작하지 않습니다.")) return;
    setDeletingId(id);
    startDelete(async () => {
      await deleteApiToken(id);
      setDeletingId(null);
    });
  }

  const feedUrl = `${baseUrl}/api/calendar-feed`;

  return (
    <div style={{ marginTop: "var(--space-8)", paddingTop: "var(--space-6)", borderTop: "1px solid var(--color-divider)" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 16, margin: "0 0 var(--space-2)" }}>외부 연동 API 토큰</h2>
      <p className="text-muted" style={{ fontSize: 12, margin: "0 0 var(--space-4)" }}>
        Claude나 다른 외부 에이전트가 본인 일정(개인 구글 캘린더 + 팀 캘린더)을 읽어가 일정
        브리핑 등에 쓸 수 있게, 토큰을 발급해 아래 API에 Authorization 헤더로 실어 호출하도록
        연결하세요. 토큰은 발급 직후에만 전체 값을 볼 수 있습니다.
      </p>

      {tokens.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 var(--space-4)", padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {tokens.map((t) => (
            <li
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--color-divider)",
                borderRadius: "var(--radius-sm, 6px)",
                fontSize: 13,
              }}
            >
              <div>
                <div style={{ fontFamily: "monospace" }}>{t.tokenPreview}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {t.label ? `${t.label} · ` : ""}발급 {formatDateTime(t.createdAt)}
                  {t.lastUsedAt ? ` · 마지막 사용 ${formatDateTime(t.lastUsedAt)}` : " · 아직 사용 안 함"}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleDelete(t.id)}
                disabled={deletingId === t.id}
              >
                {deletingId === t.id ? "삭제 중..." : "삭제"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} style={{ display: "flex", gap: "var(--space-2)", maxWidth: 480 }}>
        <input className="input" name="label" placeholder="용도(선택, 예: 일정 브리핑용)" style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "발급 중..." : "새 토큰 발급"}
        </button>
      </form>

      {state?.error && (
        <p style={{ color: "var(--color-accent-900)", fontSize: 13, marginTop: "var(--space-3)" }}>{state.error}</p>
      )}

      {state?.token && (
        <div
          style={{
            marginTop: "var(--space-4)",
            padding: "var(--space-4)",
            background: "var(--color-surface-muted, #f6f6f4)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-sm, 6px)",
          }}
        >
          <p style={{ margin: "0 0 var(--space-2)", fontSize: 13, fontWeight: 600 }}>
            토큰이 발급됐습니다 — 지금 복사해두세요, 다시 보여드리지 않습니다.
          </p>
          <code style={{ display: "block", fontSize: 13, wordBreak: "break-all", marginBottom: "var(--space-3)" }}>
            {state.token}
          </code>
          <p className="text-muted" style={{ fontSize: 12, margin: "0 0 var(--space-1)" }}>
            외부 에이전트가 아래처럼 호출하면 됩니다(기본 범위: 오늘부터 14일, <code>?days=30</code>
            또는 <code>?start=2026-09-13&end=2026-09-30</code>로 조절 가능):
          </p>
          <pre
            style={{
              margin: 0,
              padding: "var(--space-2) var(--space-3)",
              background: "var(--color-surface, #fff)",
              border: "1px solid var(--color-divider)",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: 12,
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
{`curl "${feedUrl}" \\\n  -H "Authorization: Bearer ${state.token}"`}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ProfileForm({
  name,
  companyEmail,
  title,
  googleEmail,
  phone,
  fontPreference,
  sidebarFontPreference,
  smtpUser,
  apiTokens,
  baseUrl,
}: {
  name: string | null;
  companyEmail: string;
  title: string;
  googleEmail: string;
  phone: string;
  fontPreference: FontPreferenceId;
  sidebarFontPreference: FontPreferenceId;
  smtpUser: string | null;
  apiTokens: PersonalApiToken[];
  baseUrl: string;
}) {
  const [state, formAction, pending] = useActionState(updateOwnProfile, initialState);
  // 폰트 두 필드만 컨트롤드로 관리한다 — 저장 전 실시간 미리보기를 그리려면
  // 현재 선택값을 리액트 상태로 알아야 한다(나머지 필드는 그대로 defaultValue).
  const [selectedFont, setSelectedFont] = useState<FontPreferenceId>(fontPreference);
  const [selectedSidebarFont, setSelectedSidebarFont] = useState<FontPreferenceId>(sidebarFontPreference);

  return (
    <>
    <form action={formAction} style={{ maxWidth: 640 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
        <div className="field">
          <label>이름</label>
          <input className="input" value={name ?? "-"} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
        </div>
        <div className="field">
          <label>회사메일</label>
          <input className="input" value={companyEmail} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
        </div>
        <div className="field">
          <label htmlFor="title">직급</label>
          <input className="input" id="title" name="title" defaultValue={title} placeholder="예: 팀장" />
        </div>
        <div className="field">
          <label htmlFor="googleEmail">구글메일</label>
          <input className="input" id="googleEmail" name="googleEmail" type="email" defaultValue={googleEmail} placeholder="example@gmail.com" />
        </div>
        <div className="field">
          <label htmlFor="phone">핸드폰번호</label>
          <input className="input" id="phone" name="phone" type="tel" defaultValue={phone} placeholder="010-1234-5678" />
        </div>
        <div />
        <div className="field">
          <label htmlFor="fontPreference">본문 폰트</label>
          <select
            className="input"
            id="fontPreference"
            name="fontPreference"
            value={selectedFont}
            onChange={(e) => setSelectedFont(e.target.value as FontPreferenceId)}
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <FontPreview fontId={selectedFont} />
        </div>
        <div className="field">
          <label htmlFor="sidebarFontPreference">사이드바 폰트</label>
          <select
            className="input"
            id="sidebarFontPreference"
            name="sidebarFontPreference"
            value={selectedSidebarFont}
            onChange={(e) => setSelectedSidebarFont(e.target.value as FontPreferenceId)}
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <FontPreview fontId={selectedSidebarFont} />
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 12, margin: "0 0 var(--space-5)" }}>
        이름·회사메일·역할은 관리자만 변경할 수 있습니다. 폰트는 본인 화면에만 적용되며, 산출내역
        인쇄본·고객 공개 페이지에는 영향을 주지 않습니다. 본문 폰트와 사이드바 폰트는 서로 다르게
        고를 수 있습니다. 드롭다운 아래 문구가 실제 그 폰트로 미리 보여집니다.
      </p>
      {state?.error && (
        <p style={{ color: "var(--color-accent-900)", fontSize: 13, marginBottom: "var(--space-3)" }}>{state.error}</p>
      )}
      {state?.success && (
        <p style={{ color: "var(--color-accent-700)", fontSize: 13, marginBottom: "var(--space-3)" }}>저장되었습니다.</p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
    <SmtpAccountSection smtpUser={smtpUser} />
    <ApiTokenSection tokens={apiTokens} baseUrl={baseUrl} />
    </>
  );
}
