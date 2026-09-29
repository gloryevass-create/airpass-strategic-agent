"use client";

import { useRef, useState } from "react";
import {
  ATTACHMENT_POLICY,
  attachmentHint,
  formatFileSize,
  validateAttachmentFile,
  validateAttachmentFiles,
  type AttachmentServiceKey,
} from "@/lib/attachmentPolicy";

/** 첨부파일 선택 UI — 누적 선택 + 드래그앤드롭.
 *
 * 네이티브 <input type="file" multiple>은 "한 번에 여러 개"는 고를 수 있지만
 * 탐색창을 다시 열면 앞서 고른 것이 **교체**된다. 그래서 서로 다른 폴더에 있는
 * 파일을 모아 붙일 방법이 없었다(사용자 지적, 2026-09-29: "같은 폴더 안에 있는
 * 것만 가능"). 고른 파일을 상위 state에 쌓아두고 input은 매번 비워서, 여러 번
 * 나눠 고르든 드래그해서 떨어뜨리든 계속 누적되게 한다.
 *
 * 실제 업로드는 이 컴포넌트가 하지 않는다 — 폼 제출 시점에
 * useAttachmentUpload().attachTo()가 브라우저에서 Storage로 직접 올린다
 * (lib/attachmentUpload.ts). */
export function AttachmentPicker({
  service,
  files,
  onChange,
  existingCount = 0,
  disabled = false,
  compact = false,
}: {
  service: AttachmentServiceKey;
  files: File[];
  onChange: (next: File[]) => void;
  existingCount?: number;
  disabled?: boolean;
  /** 히스토리 입력란처럼 좁은 자리에서 쓸 때 여백·글자를 줄인다. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 드래그가 자식 요소 위를 지날 때마다 dragleave가 떠서 테두리가 깜빡이므로
  // 들어온/나간 횟수를 세서 0이 될 때만 해제한다.
  const dragDepth = useRef(0);

  const policy = ATTACHMENT_POLICY[service];
  const remaining = policy.maxCount - existingCount - files.length;

  function keyOf(f: File) {
    return `${f.name}|${f.size}|${f.lastModified}`;
  }

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    const seen = new Set(files.map(keyOf));
    const fresh = incoming.filter((f) => !seen.has(keyOf(f)));
    const skipped = incoming.length - fresh.length;

    const rejected = fresh.map((f) => validateAttachmentFile(service, f)).find(Boolean);
    if (rejected) {
      setError(rejected);
      return;
    }
    const countError = validateAttachmentFiles(service, fresh, existingCount + files.length);
    if (countError) {
      setError(countError);
      return;
    }
    setError(skipped > 0 ? `이미 추가된 파일 ${skipped}개는 건너뛰었습니다.` : null);
    onChange([...files, ...fresh]);
  }

  return (
    <>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (!disabled) addFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled) inputRef.current?.click();
          }
        }}
        style={{
          border: `1px dashed ${dragging ? "var(--color-accent)" : "var(--color-border)"}`,
          background: dragging ? "var(--color-accent-100)" : "#ffffff",
          padding: compact ? "var(--space-3)" : "var(--space-5) var(--space-4)",
          textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "background 120ms, border-color 120ms",
        }}
      >
        <p style={{ margin: 0, fontSize: compact ? 12 : 13, color: "var(--color-accent-700)" }}>
          파일을 이 영역에 끌어다 놓거나, 눌러서 선택하세요
        </p>
        <p className="text-muted" style={{ margin: "var(--space-1) 0 0", fontSize: compact ? 11 : 12 }}>
          {attachmentHint(service)}
          {policy.maxCount > 1 && (remaining > 0 ? ` · ${remaining}개 더 추가 가능` : " · 더 추가할 수 없습니다")}
        </p>
        {policy.maxCount > 1 && !compact && (
          <p className="text-muted" style={{ margin: "var(--space-1) 0 0", fontSize: 12 }}>
            여러 번 나눠서 고르면 계속 쌓입니다(다른 폴더의 파일도 함께).
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple={policy.maxCount > 1}
        accept={policy.allowedTypes.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          // 같은 파일을 지웠다가 다시 고를 수 있도록 매번 비운다.
          e.target.value = "";
        }}
      />
      {error && (
        <p style={{ color: "var(--color-accent-900)", fontSize: 12, margin: "var(--space-1) 0 0" }}>{error}</p>
      )}
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {files.map((f) => (
            <span key={keyOf(f)} className="tag tag-outline" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </span>
              <span className="text-muted" style={{ fontSize: 11 }}>
                {formatFileSize(f.size)}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  onChange(files.filter((x) => keyOf(x) !== keyOf(f)));
                }}
                style={{ background: "none", border: 0, padding: 0, color: "var(--color-accent-900)", cursor: "pointer", font: "inherit" }}
                aria-label={`${f.name} 선택 해제`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** 업로드 진행 표시(n/m) — 첨부를 쓰는 폼들이 같은 문구를 쓰도록. */
export function AttachmentProgress({ progress }: { progress: { done: number; total: number } | null }) {
  if (!progress) return null;
  return (
    <p className="text-muted" style={{ fontSize: 13, margin: "var(--space-2) 0 0" }}>
      첨부파일 업로드 중... ({progress.done}/{progress.total})
    </p>
  );
}
