"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BusinessCard } from "@/lib/queries/businessCards";
import { parseBusinessCardCsv, IMPORT_CHUNK_SIZE, type BusinessCardInput } from "@/lib/businessCardCsv";
import {
  importBusinessCards,
  deleteBusinessCard,
  deleteAllBusinessCards,
} from "@/app/dashboard/actions/businessCards";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 6, fontSize: 12 }}>
      <span className="text-muted" style={{ flex: "none", minWidth: 44 }}>{label}</span>
      <span style={{ wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export function BusinessCardBoard({
  cards,
  matched,
  total,
  groups,
  pageSize,
  search,
  group,
}: {
  cards: BusinessCard[];
  matched: number;
  total: number;
  groups: string[];
  pageSize: number;
  search: string;
  group: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState(search);
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyFilter(next: { q?: string; group?: string }) {
    const sp = new URLSearchParams();
    const q = next.q ?? term;
    const g = next.group ?? group;
    if (q.trim()) sp.set("q", q.trim());
    if (g) sp.set("group", g);
    startTransition(() => router.push(`/dashboard/account/business-cards${sp.toString() ? `?${sp}` : ""}`));
  }

  /** CSV는 **브라우저에서 파싱**해 서버에는 해석된 행만 보낸다 — 파일을 그대로
   * 보내면 Server Action 본문 상한(4MB)과 Vercel 4.5MB에 걸리고, 형식 오류도
   * 서버까지 갔다 와야 알 수 있다. 300건씩 나눠 보내며 진행률을 보여준다. */
  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setMessage(null);

    const text = await file.text();
    const { cards: parsed, mergedInFile, error: parseError } = parseBusinessCardCsv(text);
    if (parseError) {
      setError(parseError);
      return;
    }
    if (parsed.length === 0) {
      setError("저장할 명함이 없습니다(이름이 있는 행을 찾지 못했습니다).");
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: parsed.length });
    let saved = 0;
    try {
      for (let i = 0; i < parsed.length; i += IMPORT_CHUNK_SIZE) {
        const chunk: BusinessCardInput[] = parsed.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await importBusinessCards(chunk);
        if ("error" in res) {
          setError(`${res.error} (${saved}건까지 저장됨)`);
          return;
        }
        saved += res.saved;
        setProgress({ done: saved, total: parsed.length });
      }
      setMessage(
        `${saved}건을 저장했습니다.` +
          (mergedInFile > 0 ? ` 파일 안에서 같은 사람(이름·회사·휴대폰 동일) ${mergedInFile}건은 하나로 합쳤습니다.` : "")
      );
      router.refresh();
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDeleteAll() {
    if (!window.confirm(`내 명함첩 ${total}건을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    if (!window.confirm("정말 삭제합니다. 다시 올리려면 CSV가 필요합니다.")) return;
    startTransition(async () => {
      const { deleted } = await deleteAllBusinessCards();
      setMessage(`${deleted}건을 삭제했습니다.`);
      router.refresh();
    });
  }

  const busy = pending || uploading;

  return (
    <>
      {/* ── 업로드 ── */}
      <div className="card blueprint" style={{ padding: "var(--space-5)", background: "#ffffff", marginBottom: "var(--space-5)" }}>
        <div className="card-kicker">명함첩 CSV 올리기</div>
        <p className="text-muted" style={{ fontSize: 12, margin: "var(--space-2) 0 var(--space-3)" }}>
          리멤버 앱 → 명함첩 → 내보내기로 받은 CSV를 그대로 올리세요. 같은 사람(이름·회사·휴대폰이 같은 명함)은
          덮어쓰므로, 갱신된 파일을 다시 올려도 건수가 불어나지 않습니다.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => void handleFile(e.target.files?.[0])}
            className="input"
            style={{ maxWidth: 360 }}
          />
          {total > 0 && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={handleDeleteAll}>
              전체 삭제
            </button>
          )}
        </div>
        {progress && (
          <p className="text-muted" style={{ fontSize: 13, margin: "var(--space-2) 0 0" }}>
            저장 중... ({progress.done}/{progress.total})
          </p>
        )}
        {message && <p style={{ fontSize: 13, margin: "var(--space-2) 0 0", color: "var(--color-accent-700)" }}>{message}</p>}
        {error && <p style={{ fontSize: 13, margin: "var(--space-2) 0 0", color: "var(--color-accent-900)" }}>{error}</p>}
      </div>

      {/* ── 검색 ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-3)" }}>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="이름·회사·부서·직함·연락처 검색"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilter({ q: e.currentTarget.value });
          }}
        />
        <button type="button" className="btn btn-secondary blueprint" disabled={busy} onClick={() => applyFilter({})}>
          검색
        </button>
        {groups.length > 0 && (
          <select
            className="input"
            style={{ maxWidth: 180 }}
            value={group}
            onChange={(e) => applyFilter({ group: e.target.value })}
          >
            <option value="">그룹 전체</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}
        {(search || group) && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setTerm("");
              startTransition(() => router.push("/dashboard/account/business-cards"));
            }}
          >
            초기화
          </button>
        )}
        <span className="text-muted" style={{ fontSize: 12, marginLeft: "auto" }}>
          {search || group ? `${matched}건 검색됨 · ` : ""}전체 {total}건
          {matched > pageSize && ` (상위 ${pageSize}건 표시 — 검색으로 좁혀주세요)`}
        </span>
      </div>

      {/* ── 목록 ── */}
      {cards.length === 0 ? (
        <div className="card blueprint" style={{ padding: "var(--space-6)", background: "#ffffff", textAlign: "center" }}>
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            {total === 0 ? "아직 올린 명함이 없습니다. 위에서 CSV를 올려주세요." : "검색 결과가 없습니다."}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table mobile-card-table" style={{ background: "#ffffff" }}>
            <thead>
              <tr>
                <th>이름</th>
                <th>회사</th>
                <th>부서 · 직함</th>
                <th>연락처</th>
                <th>그룹</th>
                <th style={{ width: 60 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td data-label="이름" className="list-cell-title">{c.name}</td>
                  <td data-label="회사">{c.company ?? "-"}</td>
                  <td data-label="부서 · 직함">{[c.department, c.title].filter(Boolean).join(" · ") || "-"}</td>
                  <td data-label="연락처">
                    <Field label="휴대폰" value={c.mobile} />
                    <Field label="전화" value={c.workPhone} />
                    <Field label="이메일" value={c.email} />
                    <Field label="주소" value={c.address} />
                  </td>
                  <td data-label="그룹">{c.groupName ?? "-"}</td>
                  <td data-label="관리">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: "2px 6px", minHeight: "auto" }}
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`"${c.name}" 명함을 삭제할까요?`)) return;
                        startTransition(async () => {
                          await deleteBusinessCard(c.id);
                          router.refresh();
                        });
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
