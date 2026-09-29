"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { updateMemo, type UpdateMemoState } from "@/app/dashboard/memos/actions";
import type { MemoDetail } from "@/lib/queries/memos";
import { useAttachmentUpload } from "@/lib/attachmentUpload";
import { AttachmentPicker, AttachmentProgress } from "@/components/AttachmentPicker";

const initialState: UpdateMemoState = undefined;

const CATEGORY_OPTIONS = [
  { value: "business", label: "SI Business" },
  { value: "cooperation", label: "Cooperation" },
  { value: "marketing", label: "Marketing" },
  { value: "etc", label: "etc" },
];

export function MemoEditForm({ memo }: { memo: MemoDetail }) {
  const action = updateMemo.bind(null, memo.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [, startSubmit] = useTransition();
  // 첨부파일은 제출 시점에 브라우저가 Storage로 직접 올린다(lib/attachmentPolicy.ts 참고).
  const upload = useAttachmentUpload("memo");
  const busy = pending || upload.uploading;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const formData = new FormData(e.currentTarget);
    if (!(await upload.attachTo(formData))) return;
    startSubmit(() => formAction(formData));
  }

  function toggleRemove(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <div className="field">
        <label htmlFor="category">구분</label>
        <select id="category" name="category" required defaultValue={memo.category} className="input" style={{ maxWidth: 240 }}>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="title">제목</label>
        <input id="title" name="title" type="text" required maxLength={200} defaultValue={memo.title} className="input" />
      </div>

      <div className="field">
        <label htmlFor="content">내용</label>
        <textarea id="content" name="content" required rows={10} defaultValue={memo.content} className="input" />
      </div>

      {memo.attachments.length > 0 && (
        <div className="field">
          <label>기존 첨부파일</label>
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", listStyle: "none", margin: 0, padding: 0 }}>
            {memo.attachments.map((a) => (
              <li key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  name="removeAttachments"
                  value={a.id}
                  id={`remove-${a.id}`}
                  checked={removedIds.has(a.id)}
                  onChange={() => toggleRemove(a.id)}
                />
                <label
                  htmlFor={`remove-${a.id}`}
                  className={removedIds.has(a.id) ? "text-muted" : undefined}
                  style={removedIds.has(a.id) ? { textDecoration: "line-through" } : undefined}
                >
                  📎 {a.fileName}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-muted" style={{ fontSize: 12, margin: "var(--space-1) 0 0" }}>
            체크한 파일은 저장 시 삭제됩니다.
          </p>
        </div>
      )}

      <div className="field">
        <label>새 파일첨부</label>
        <AttachmentPicker
          service="memo"
          files={upload.files}
          onChange={upload.setFiles}
          existingCount={memo.attachments.length - removedIds.size}
          disabled={busy}
        />
      </div>

      {(state?.error || upload.uploadError) && (
        <p style={{ fontSize: 13, color: "var(--color-accent-900)" }}>{upload.uploadError ?? state?.error}</p>
      )}
      <AttachmentProgress progress={upload.progress} />

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button type="submit" disabled={busy} className="btn btn-primary blueprint">
          {upload.uploading ? "업로드 중..." : pending ? "저장 중..." : "저장"}
        </button>
        <Link href={`/dashboard/memos/${memo.id}`} className="btn btn-ghost">
          취소
        </Link>
      </div>
    </form>
  );
}
