"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { DriveMaterialFile } from "@/lib/googleDriveMaterials";
import type { QuotationSummary } from "@/lib/queries/quotations";
import { sendMaterialEmailAction, type SendMaterialEmailState } from "@/app/dashboard/actions/materialEmail";
import { AI_MATERIAL_EMAIL_DRAFT_KEY, type AiMaterialEmailDraft } from "@/lib/aiMaterialEmailDraft";
import {
  DEFAULT_MATERIAL_EMAIL_SUBJECT,
  DEFAULT_MATERIAL_EMAIL_MESSAGE,
  DEFAULT_MATERIAL_EMAIL_HOMEPAGE,
  DEFAULT_MATERIAL_EMAIL_YOUTUBE,
  DEFAULT_MATERIAL_EMAIL_ADDRESS,
} from "@/lib/materialEmailDefaults";
import { buildMaterialEmailHtml } from "@/lib/materialEmailTemplate";
import { NavIcon } from "@/components/icons/NavIcon";

const initialState: SendMaterialEmailState = undefined;

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isVideoFile(f: DriveMaterialFile): boolean {
  return f.mimeType.startsWith("video/");
}

// macOS(파인더)에서 올린 한글 파일명은 자모가 분리된 NFD로 저장되는 경우가 많아,
// 검색창에 입력한 NFC 문자열과 바이트 단위로 달라 .includes()가 실패해 일부
// 파일만 검색되는 버그가 있었다 — lib/materialEmailTemplate.ts의 카탈로그 매칭에
// 적용했던 것과 같은 정규화를 여기에도 적용한다(사용자 확인, 2026-08-28 참고).
function normalize(text: string): string {
  return text.normalize("NFC").toLowerCase();
}

function FileTypeIcon({ video }: { video: boolean }) {
  return video ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", opacity: 0.6 }}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", opacity: 0.6 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function FileGroup({
  title,
  files,
  selected,
  onToggle,
  onToggleAll,
}: {
  title: string;
  files: DriveMaterialFile[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (files: DriveMaterialFile[], selectAll: boolean) => void;
}) {
  const allSelected = files.length > 0 && files.every((f) => selected.has(f.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px var(--space-3)",
          fontSize: 12,
          fontWeight: 600,
          color: "color-mix(in srgb, var(--color-text) 60%, transparent)",
          background: "var(--color-surface)",
        }}
      >
        <input
          type="checkbox"
          checked={allSelected}
          disabled={files.length === 0}
          onChange={() => onToggleAll(files, !allSelected)}
          style={{ width: 14, height: 14, flex: "none", accentColor: "var(--color-accent)" }}
        />
        {title} ({files.length}) 전체 선택
      </label>
      {files.length === 0 && (
        <p className="text-muted" style={{ padding: "var(--space-4) 0", textAlign: "center", fontSize: 13 }}>
          해당 없음
        </p>
      )}
      {files.map((f) => (
        <label
          key={f.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: "1px solid var(--color-divider)",
            padding: "var(--space-2) var(--space-3)",
            fontSize: 13,
            cursor: "pointer",
            background: selected.has(f.id) ? "var(--color-accent-100)" : undefined,
          }}
        >
          <input
            type="checkbox"
            name="fileIds"
            value={f.id}
            checked={selected.has(f.id)}
            onChange={() => onToggle(f.id)}
            style={{ width: 14, height: 14, flex: "none", accentColor: "var(--color-accent)" }}
          />
          <FileTypeIcon video={isVideoFile(f)} />
          <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>
            {f.name}
          </span>
          <span className="text-muted" style={{ flex: "none", fontSize: 11 }}>
            {formatFileSize(f.sizeBytes)}
          </span>
        </label>
      ))}
    </div>
  );
}

/** 산출내역(견적) 첨부 검색 — 최대 1건만 첨부한다(템플릿에 "견적서 원본 PDF"
 * 자리가 하나뿐이라 단일 선택). */
function QuotationPicker({
  quotations,
  value,
  onChange,
}: {
  quotations: QuotationSummary[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = quotations.find((q) => q.id === value) ?? null;

  useEffect(() => {
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return quotations;
    return quotations.filter(
      (item) =>
        normalize(item.quoteNumber).includes(q) ||
        normalize(item.customerName).includes(q) ||
        normalize(item.projectTitle ?? "").includes(q)
    );
  }, [quotations, search]);

  return (
    <div ref={panelRef} className="field" style={{ position: "relative" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--color-text)" }}>
        <NavIcon name="receipt" width={14} height={14} stroke="var(--color-accent)" />
        산출내역(견적) 첨부 — 선택 안 함
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-secondary"
          style={{ minWidth: 0, flex: 1, justifyContent: "flex-start", overflow: "hidden" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 400 }}>
            🔍 {selected ? `${selected.quoteNumber} · ${selected.customerName}` : `산출내역 검색 (${quotations.length}건)`}
          </span>
        </button>
        {selected && (
          <button type="button" onClick={() => onChange(null)} aria-label="첨부 해제" className="btn btn-ghost" style={{ flex: "none" }}>
            ✕
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "100%",
            zIndex: 20,
            marginTop: 4,
            maxHeight: 256,
            width: "100%",
            overflowY: "auto",
            border: "1px solid var(--color-divider)",
            background: "#ffffff",
            textAlign: "left",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid var(--color-divider)",
              background: "#ffffff",
              padding: "var(--space-2) var(--space-3)",
            }}
          >
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="기관명·산출번호로 검색"
              className="input"
              style={{ minWidth: 0, flex: 1, fontSize: 12, minHeight: 30 }}
            />
            <button type="button" onClick={() => setOpen(false)} className="btn btn-primary" style={{ flex: "none", fontSize: 11, minHeight: 30, padding: "0 10px" }}>
              선택 완료
            </button>
          </div>
          {filtered.length === 0 ? (
            <p className="text-muted" style={{ padding: "var(--space-4) var(--space-3)", textAlign: "center", fontSize: 12 }}>
              검색 결과가 없습니다.
            </p>
          ) : (
            filtered.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  onChange(q.id);
                  setSearch("");
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  borderTop: "1px solid var(--color-divider)",
                  borderLeft: 0,
                  borderRight: 0,
                  borderBottom: 0,
                  padding: "var(--space-2) var(--space-3)",
                  textAlign: "left",
                  background: q.id === value ? "var(--color-accent-100)" : "transparent",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700 }}>
                  {q.quoteNumber} · {q.customerName}
                </span>
                <span className="text-muted" style={{ flex: "none", fontSize: 10 }}>
                  {q.status === "final" ? "최종" : "임시"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function MaterialEmailForm({
  files,
  quotations,
  productLinkLabels,
  senderName,
  senderTitle,
  senderEmail,
  senderPhone,
}: {
  files: DriveMaterialFile[];
  quotations: QuotationSummary[];
  productLinkLabels: { label: string; matched: boolean }[];
  senderName: string;
  senderTitle: string | null;
  senderEmail: string;
  senderPhone: string | null;
}) {
  const [state, formAction, pending] = useActionState(sendMaterialEmailAction, initialState);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(files.map((f) => f.id)));
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState(DEFAULT_MATERIAL_EMAIL_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MATERIAL_EMAIL_MESSAGE);
  const [quotationId, setQuotationId] = useState<string | null>(null);
  // 메일 하단 푸터 — 예전에는 템플릿에 하드코딩돼 있었는데 발송할 때마다 고칠 수
  // 있어야 한다는 요청(2026-09-14)으로 입력란으로 뺐다. 기본값은 그대로라 평소엔
  // 손대지 않아도 예전과 같은 메일이 나간다.
  const [homepage, setHomepage] = useState(DEFAULT_MATERIAL_EMAIL_HOMEPAGE);
  const [youtube, setYoutube] = useState(DEFAULT_MATERIAL_EMAIL_YOUTUBE);
  const [companyAddress, setCompanyAddress] = useState(DEFAULT_MATERIAL_EMAIL_ADDRESS);
  const [aiNotice, setAiNotice] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // AI 명령 입력창에서 넘어온 초안이 있으면 채워 넣는다(자동 발송은 하지 않고
  // 항상 이 화면에서 사람이 확인 후 직접 "보내기"를 눌러야 한다). sessionStorage는
  // 브라우저 전용 외부 저장소라 마운트 시 1회 동기화가 정당한 useEffect 용도다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const raw = window.sessionStorage.getItem(AI_MATERIAL_EMAIL_DRAFT_KEY);
    if (!raw) return;
    window.sessionStorage.removeItem(AI_MATERIAL_EMAIL_DRAFT_KEY);
    try {
      const draft = JSON.parse(raw) as AiMaterialEmailDraft;
      setRecipients(draft.recipients);
      // 주소만 말하고 제목·내용·자료를 따로 지정하지 않았으면 기본 안내문·전체
      // 자료 선택을 그대로 쓴다 — AI가 빈 값으로 덮어써서 기본값이 사라지지
      // 않게 한다(사용자 확인, 2026-08-26).
      if (draft.subject) setSubject(draft.subject);
      if (draft.message) setMessage(draft.message);
      if (draft.fileNameHints.length > 0) {
        const hints = draft.fileNameHints.map((h) => h.toLowerCase()).filter(Boolean);
        const matched = files.filter((f) => hints.some((h) => f.name.toLowerCase().includes(h)));
        if (matched.length > 0) setSelected(new Set(matched.map((f) => f.id)));
      }
      setAiNotice(true);
    } catch {
      // 초안 파싱 실패 시 조용히 무시하고 빈 폼으로 둔다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return files;
    return files.filter((f) => normalize(f.name).includes(q));
  }, [files, search]);

  const documents = useMemo(() => filtered.filter((f) => !isVideoFile(f)), [filtered]);
  const videos = useMemo(() => filtered.filter(isVideoFile), [filtered]);

  const selectedQuotation = quotations.find((q) => q.id === quotationId) ?? null;

  // 미리보기는 실제 발송(app/dashboard/actions/materialEmail.ts)과 같은
  // buildMaterialEmailHtml을 그대로 써서 항상 같은 결과가 보이게 한다 — 단,
  // 구글드라이브 실제 공유 링크(ensureFileShared)는 발송 시점에만 만들기 때문에
  // 미리보기에서는 자리표시 링크(#)를 쓴다(사용자 확인, 2026-08-28).
  const previewHtml = useMemo(() => {
    const selectedFiles = files.filter((f) => selected.has(f.id));
    const html = buildMaterialEmailHtml({
      subject: subject || "(제목 없음)",
      message: message || "(안내 내용 없음)",
      senderName: senderName || "-",
      senderTitle,
      senderEmail: senderEmail || "-",
      senderPhone,
      logoUrl: "/material-email-banner.png",
      documents: selectedFiles.filter((f) => !isVideoFile(f)).map((f) => ({ name: f.name, link: "#" })),
      videos: selectedFiles.filter(isVideoFile).map((f) => ({ name: f.name, link: "#" })),
      quotation: selectedQuotation
        ? { quoteNumber: selectedQuotation.quoteNumber, customerName: selectedQuotation.customerName, printUrl: "#" }
        : null,
      productLinks: productLinkLabels.map((p) => ({ label: p.label, link: p.matched ? "#" : null })),
      homepage,
      youtube,
      companyAddress,
    });
    // 자리표시 링크(href="#")를 이 iframe(srcDoc) 안에서 클릭하면, 상대 경로가
    // "about:srcdoc"이 아니라 이 화면(부모 문서)의 실제 URL을 기준으로 풀려서
    // iframe이 실제 대시보드 페이지를 통째로 다시 불러와버렸다(마치 메일
    // 작성 화면으로 돌아온 것처럼 보이는 버그, 2026-09-12 사용자 확인). 실제
    // 발송 메일(buildMaterialEmailHtml 원본)은 건드리지 않고, 미리보기
    // 전용으로 클릭을 막는 스크립트만 덧붙인다.
    return html.replace(
      "</head>",
      `<script>document.addEventListener("click",function(e){var a=e.target.closest("a");if(a)e.preventDefault();});</script></head>`
    );
  }, [
    files,
    selected,
    subject,
    message,
    senderName,
    senderTitle,
    senderEmail,
    senderPhone,
    selectedQuotation,
    productLinkLabels,
    homepage,
    youtube,
    companyAddress,
  ]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(group: DriveMaterialFile[], selectAll: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of group) {
        if (selectAll) next.add(f.id);
        else next.delete(f.id);
      }
      return next;
    });
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        // 성공 시 새 발송을 위해 선택 상태를 기본값(전체 선택)으로 되돌린다
        // (실패 시에는 재시도하기 편하게 방금 선택 상태를 유지).
        if (state?.success) {
          setSelected(new Set(files.map((f) => f.id)));
          setQuotationId(null);
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
    >
      <input type="hidden" name="quotationId" value={quotationId ?? ""} />

      {aiNotice && (
        <p
          style={{
            border: "1px solid var(--color-divider)",
            background: "var(--color-accent-100)",
            padding: "var(--space-2) var(--space-3)",
            fontSize: 12,
            color: "var(--color-accent-800)",
          }}
        >
          AI 명령 입력창에서 넘어온 내용으로 미리 채웠습니다 — 내용을 확인하고 직접 보내주세요.
        </p>
      )}
      <div className="field">
        <label htmlFor="recipients" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--color-text)" }}>
          <NavIcon name="user" width={14} height={14} stroke="var(--color-accent)" />
          받는 사람 이메일 (쉼표 또는 줄바꿈으로 여러 명 입력)
        </label>
        <textarea
          id="recipients"
          name="recipients"
          required
          rows={2}
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="example@company.com, another@company.com"
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="subject" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--color-text)" }}>
          <NavIcon name="document" width={14} height={14} stroke="var(--color-accent)" />
          제목
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          required
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="message" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--color-text)" }}>
          <NavIcon name="chat" width={14} height={14} stroke="var(--color-accent)" />
          안내 내용
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="보내드리는 자료에 대한 안내 문구를 입력하세요."
          className="input"
        />
      </div>

      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: "var(--color-text)" }}>
          <NavIcon name="link" width={14} height={14} stroke="var(--color-accent)" />
          메일 하단 정보
        </label>
        <p className="text-muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
          메일 맨 아래에 들어가는 홈페이지·유튜브·회사주소입니다. 기본값이 채워져 있고, 이번 발송에만
          다르게 넣고 싶으면 고쳐서 보내세요. 비워두면 그 줄은 메일에서 빠집니다.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 220px" }}>
            <label htmlFor="homepage" style={{ fontSize: 12 }}>홈페이지</label>
            <input
              id="homepage"
              name="homepage"
              type="text"
              maxLength={200}
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
              placeholder="www.airpass.co.kr"
              className="input"
            />
          </div>
          <div className="field" style={{ flex: "1 1 220px" }}>
            <label htmlFor="youtube" style={{ fontSize: 12 }}>유튜브</label>
            <input
              id="youtube"
              name="youtube"
              type="text"
              maxLength={200}
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="@AIRPASS_XR"
              className="input"
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label htmlFor="companyAddress" style={{ fontSize: 12 }}>회사주소</label>
          <input
            id="companyAddress"
            name="companyAddress"
            type="text"
            maxLength={300}
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            placeholder="경기도 하남시 하남대로 947(풍산동, 하남 테크노밸리 U1CENTER) D동 15층"
            className="input"
          />
        </div>
      </div>

      <QuotationPicker quotations={quotations} value={quotationId} onChange={setQuotationId} />
      <p className="text-muted" style={{ fontSize: 12, marginTop: -8 }}>
        산출내역을 첨부하면 메일에 &ldquo;견적 및 제품자료 안내&rdquo; 섹션(견적서 원본 PDF 링크 포함)이 자동으로
        추가됩니다. 첨부하지 않으면 이 섹션은 메일에 표시되지 않습니다.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500 }}>
            <NavIcon name="paperclip" width={14} height={14} stroke="var(--color-accent)" />
            자료 선택 {selected.size > 0 && `(${selected.size}개 선택됨)`}
          </span>
          <div style={{ position: "relative", width: 192 }}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", opacity: 0.45, pointerEvents: "none" }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="자료명 검색"
              className="input"
              style={{ width: "100%", fontSize: 12, minHeight: 30, paddingLeft: 24 }}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-muted" style={{ border: "1px solid var(--color-divider)", padding: "var(--space-4)", textAlign: "center", fontSize: 13 }}>
            {files.length === 0 ? "자료 폴더가 비어 있습니다." : "검색 결과가 없습니다."}
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <div style={{ maxHeight: 288, flex: "1 1 280px", overflow: "auto", border: "1px solid var(--color-divider)" }}>
              <FileGroup title="보낼 문서" files={documents} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
            </div>
            <div style={{ maxHeight: 288, flex: "1 1 280px", overflow: "auto", border: "1px solid var(--color-divider)" }}>
              <FileGroup title="보낼 영상" files={videos} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
            </div>
          </div>
        )}
      </div>

      {state?.error && <p style={{ color: "var(--color-accent-900)", fontSize: 13 }}>{state.error}</p>}
      {state?.success && <p style={{ color: "var(--color-accent-700)", fontSize: 13 }}>메일을 발송했습니다.</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <button type="button" onClick={() => setPreviewOpen(true)} className="btn btn-secondary">
          미리보기
        </button>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "발송 중..." : "보내기"}
        </button>
      </div>

      {previewOpen && (
        <div className="dialog-backdrop" onClick={() => setPreviewOpen(false)}>
          <div
            className="dialog"
            style={{ width: "min(960px,96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0, background: "#ffffff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--color-divider)",
                padding: "var(--space-3) var(--space-4)",
              }}
            >
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 15 }}>메일 미리보기</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="미리보기 닫기"
                className="btn btn-ghost"
                style={{ padding: "2px 8px" }}
              >
                ✕
              </button>
            </div>
            <iframe title="메일 미리보기" srcDoc={previewHtml} style={{ height: "75vh", width: "100%", border: 0 }} />
          </div>
        </div>
      )}
    </form>
  );
}
