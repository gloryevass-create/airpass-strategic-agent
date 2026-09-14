"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Vendor, VendorDocumentType } from "@/lib/queries/vendors";
import { saveVendor, deleteVendor, uploadVendorDocument, deleteVendorDocument } from "@/app/dashboard/actions/vendors";
import { SearchInput } from "@/components/dashboard/SearchInput";

const DOCUMENT_LABELS: Record<VendorDocumentType, string> = {
  business_registration: "사업자등록증",
  bankbook: "통장 사본",
  business_card: "명함",
  product_material: "제품자료",
};
const DOCUMENT_HINTS: Record<VendorDocumentType, string> = {
  business_registration: "업체명·사업자번호·대표자·주소·업태·종목",
  bankbook: "은행·계좌번호·예금주",
  business_card: "담당자·직함·연락처·이메일",
  product_material: "카탈로그·브로슈어 등 참고자료(여러 건 첨부)",
};
const DOCUMENT_TYPES = Object.keys(DOCUMENT_LABELS) as VendorDocumentType[];

type VendorDraft = {
  companyName: string;
  businessNumber: string;
  representativeName: string;
  businessType: string;
  businessItem: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  contactEmail: string;
  notes: string;
};

const EMPTY_DRAFT: VendorDraft = {
  companyName: "",
  businessNumber: "",
  representativeName: "",
  businessType: "",
  businessItem: "",
  address: "",
  phone: "",
  email: "",
  bankName: "",
  accountNumber: "",
  accountHolder: "",
  contactName: "",
  contactTitle: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
};

function draftFromVendor(vendor: Vendor | null): VendorDraft {
  if (!vendor) return EMPTY_DRAFT;
  return {
    companyName: vendor.companyName ?? "",
    businessNumber: vendor.businessNumber ?? "",
    representativeName: vendor.representativeName ?? "",
    businessType: vendor.businessType ?? "",
    businessItem: vendor.businessItem ?? "",
    address: vendor.address ?? "",
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
    bankName: vendor.bankName ?? "",
    accountNumber: vendor.accountNumber ?? "",
    accountHolder: vendor.accountHolder ?? "",
    contactName: vendor.contactName ?? "",
    contactTitle: vendor.contactTitle ?? "",
    contactPhone: vendor.contactPhone ?? "",
    contactEmail: vendor.contactEmail ?? "",
    notes: vendor.notes ?? "",
  };
}

export function VendorManager({ vendors }: { vendors: Vendor[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(vendors[0]?.id ?? null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<VendorDraft>(draftFromVendor(vendors[0] ?? null));
  const [uploading, setUploading] = useState<VendorDocumentType | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [, startTransition] = useTransition();
  const fileInputRefs = useRef<Partial<Record<VendorDocumentType, HTMLInputElement | null>>>({});
  const detailRef = useRef<HTMLDivElement | null>(null);

  const selected = isNew ? null : vendors.find((v) => v.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      `${v.companyName} ${v.businessNumber ?? ""} ${v.contactName ?? ""} ${v.phone ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [vendors, search]);

  function updateDraft(key: keyof VendorDraft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // 모바일에서는 업체 목록 아래에 상세 패널이 세로로 쌓이기 때문에, 목록에서
  // 업체를 골라도 화면에는 여전히 목록만 보여 아무 일도 안 일어난 것처럼
  // 보인다(2026-09-14, 사용자 요청) — 좁은 화면에서만 상세 패널로 스크롤해
  // 준다. 데스크톱은 좌우로 나란히 있어 이미 보이므로 그대로 둔다.
  function scrollToDetailOnMobile() {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function choose(vendor: Vendor) {
    setSelectedId(vendor.id);
    setIsNew(false);
    setDraft(draftFromVendor(vendor));
    setMessage("");
    setError(null);
    scrollToDetailOnMobile();
  }

  function newVendor() {
    setIsNew(true);
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setMessage("사업자등록증·통장 사본·명함을 먼저 올리거나 업체 정보를 직접 입력해 주세요.");
    setError(null);
    scrollToDetailOnMobile();
  }

  function handleDeleteVendor(id: string) {
    if (!window.confirm("이 제조사를 삭제할까요? 첨부된 문서도 함께 삭제됩니다.")) return;
    if (selectedId === id) setSelectedId(null);
    startTransition(async () => {
      await deleteVendor(id);
      router.refresh();
    });
  }

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const formData = new FormData();
      if (selected) formData.set("id", selected.id);
      for (const [key, value] of Object.entries(draft)) {
        formData.set(key, value);
      }
      const result = await saveVendor(undefined, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessage("업체 정보를 저장했습니다.");
      router.refresh();
    });
  }

  async function handleUpload(type: VendorDocumentType, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const input = fileInputRefs.current[type];
    if (input) input.value = "";

    setUploading(type);
    setError(null);
    setMessage(`${DOCUMENT_LABELS[type]}을 올리고 정보를 읽는 중입니다.`);
    try {
      const formData = new FormData();
      if (selected) formData.set("vendorId", selected.id);
      formData.set("documentType", type);
      formData.set("file", file);
      const result = await uploadVendorDocument(formData);
      if (!result.ok) {
        setMessage("");
        setError(result.error);
        return;
      }
      setSelectedId(result.vendorId);
      setIsNew(false);
      // 추출된 값이 있는 필드만 폼에 반영한다(비어있는 필드는 기존 입력을 유지).
      setDraft((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(result.extracted)) {
          if (value && value.trim()) next[key as keyof VendorDraft] = value.trim();
        }
        return next;
      });
      setMessage("문서에서 읽은 정보를 반영했습니다. 확인·수정 후 저장해 주세요.");
      router.refresh();
    } finally {
      setUploading(null);
    }
  }

  function handleDeleteDocument(documentId: string) {
    if (!window.confirm("이 첨부 문서를 삭제할까요?")) return;
    startTransition(async () => {
      await deleteVendorDocument(documentId);
      router.refresh();
    });
  }

  function inputField(key: keyof VendorDraft, label: string, wide?: boolean) {
    return (
      <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
        <label>{label}</label>
        <input className="input" value={draft[key]} onChange={(e) => updateDraft(key, e.target.value)} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}>
      <aside className="vendor-list-aside" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)", flex: "1 1 288px", maxWidth: 320 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <strong>등록 업체</strong>
            <span className="tag tag-neutral">{vendors.length}곳</span>
          </div>
          <button type="button" onClick={newVendor} className="btn btn-secondary" style={{ fontSize: 12 }}>
            + 새 업체
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="업체명·사업자번호·담당자 검색" style={{ maxWidth: "none", marginBottom: 0 }} />
        <div style={{ margin: "0 calc(var(--space-4) * -1)", display: "flex", maxHeight: "calc(100vh - 280px)", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {filtered.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => choose(v)}
              style={{
                display: "flex",
                width: "100%",
                flexDirection: "column",
                gap: 2,
                borderLeft: `2px solid ${selected?.id === v.id ? "var(--color-accent)" : "transparent"}`,
                padding: "var(--space-2) var(--space-4)",
                textAlign: "left",
                fontSize: 13,
                background: selected?.id === v.id ? "var(--color-accent-100)" : "transparent",
                border: 0,
                borderLeftWidth: 2,
                borderLeftStyle: "solid",
                borderLeftColor: selected?.id === v.id ? "var(--color-accent)" : "transparent",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span style={{ fontWeight: 600, color: selected?.id === v.id ? "var(--color-accent-700)" : "var(--color-text)" }}>
                {v.companyName}
              </span>
              <span className="text-muted" style={{ fontSize: 11 }}>
                {v.businessNumber || "사업자번호 미등록"}
              </span>
              <span className="text-muted" style={{ fontSize: 11 }}>
                {v.contactName || v.phone || "담당자 정보 미등록"}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-muted" style={{ padding: "var(--space-6) var(--space-4)", textAlign: "center", fontSize: 13 }}>
              등록된 업체가 없습니다.
            </p>
          )}
        </div>
      </aside>

      <div ref={detailRef} style={{ display: "flex", flex: "3 1 480px", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)", border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)" }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }} className="text-muted">
              Partner Vendor
            </span>
            <h2 style={{ margin: "2px 0 0", fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600 }}>
              {selected ? selected.companyName || "업체 정보" : "새 제조사 등록"}
            </h2>
            <p className="text-muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
              문서를 올리면 내용을 자동 입력하며, 모든 항목은 직접 수정할 수 있습니다.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            {selected && (
              <button type="button" onClick={() => handleDeleteVendor(selected.id)} className="btn btn-secondary btn-danger">
                삭제
              </button>
            )}
            <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? "저장 중..." : "업체 정보 저장"}
            </button>
          </div>
        </div>

        {(message || error) && (
          <p style={{ fontSize: 13, color: error ? "var(--color-accent-900)" : undefined }} className={error ? undefined : "text-muted"}>
            {error || message}
          </p>
        )}

        <section style={{ border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
            <strong style={{ fontSize: 14 }}>업체 문서</strong>
            <span className="text-muted" style={{ fontSize: 11 }}>
              JPG·PNG·WebP·PDF, 파일당 12MB 이하
            </span>
          </div>
          <div className="vendor-doc-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-3)" }}>
            {DOCUMENT_TYPES.map((type) => {
              const docs = selected?.documents.filter((d) => d.documentType === type) ?? [];
              return (
                <div key={type} style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--color-divider)", background: "var(--color-surface)", padding: "var(--space-3)" }}>
                  <div>
                    <b style={{ fontSize: 13 }}>{DOCUMENT_LABELS[type]}</b>
                    <p className="text-muted" style={{ margin: "2px 0 0", fontSize: 11 }}>
                      {DOCUMENT_HINTS[type]}
                    </p>
                  </div>
                  {docs.map((doc) => (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                      {doc.signedUrl ? (
                        <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.originalName}
                        </a>
                      ) : (
                        <span className="text-muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.originalName}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc.id)}
                        style={{ flex: "none", background: "none", border: 0, padding: 0, color: "var(--color-accent-900)", cursor: "pointer", font: "inherit", fontSize: 11 }}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                  <label
                    style={{
                      display: "flex",
                      cursor: "pointer",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px dashed var(--color-accent)",
                      background: "#ffffff",
                      padding: "var(--space-2) var(--space-3)",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                    className="text-muted"
                  >
                    <input
                      ref={(el) => {
                        fileInputRefs.current[type] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      disabled={uploading !== null}
                      onChange={(e) => void handleUpload(type, e.target.files)}
                      hidden
                    />
                    {uploading === type ? "정보 읽는 중..." : docs.length ? "파일 추가·교체" : "파일 선택"}
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)" }}>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <strong style={{ fontSize: 14 }}>사업자 정보</strong>
            <span className="text-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              사업자등록증에서 자동 입력
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--space-3)" }}>
            {inputField("companyName", "업체명 *")}
            {inputField("businessNumber", "사업자등록번호")}
            {inputField("representativeName", "대표자")}
            {inputField("phone", "대표 전화")}
            {inputField("businessType", "업태")}
            {inputField("businessItem", "종목")}
            {inputField("address", "주소", true)}
            {inputField("email", "대표 이메일")}
          </div>
        </section>

        <section style={{ border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)" }}>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <strong style={{ fontSize: 14 }}>정산 계좌</strong>
            <span className="text-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              통장 사본에서 자동 입력
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)" }}>
            {inputField("bankName", "은행")}
            {inputField("accountNumber", "계좌번호")}
            {inputField("accountHolder", "예금주")}
          </div>
        </section>

        <section style={{ border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)" }}>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <strong style={{ fontSize: 14 }}>담당자 정보</strong>
            <span className="text-muted" style={{ marginLeft: 8, fontSize: 11 }}>
              명함에서 자동 입력
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--space-3)" }}>
            {inputField("contactName", "담당자")}
            {inputField("contactTitle", "직함")}
            {inputField("contactPhone", "연락처")}
            {inputField("contactEmail", "이메일")}
          </div>
        </section>

        <section style={{ border: "1px solid var(--color-divider)", borderRadius: 8, boxShadow: "var(--shadow-sm)", background: "#ffffff", padding: "var(--space-4)" }}>
          <strong style={{ display: "block", marginBottom: 8, fontSize: 14 }}>참고 사항</strong>
          <textarea
            value={draft.notes}
            onChange={(e) => updateDraft("notes", e.target.value)}
            placeholder="계약·정산·연락 시 참고할 내용을 입력하세요."
            rows={3}
            className="input"
            style={{ width: "100%" }}
          />
        </section>
      </div>
    </div>
  );
}
