"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { createMemo, type CreateMemoState } from "@/app/dashboard/memos/actions";
import { useAttachmentUpload } from "@/lib/attachmentUpload";
import { AttachmentPicker, AttachmentProgress } from "@/components/AttachmentPicker";

const initialState: CreateMemoState = undefined;

const CATEGORY_OPTIONS = [
  { value: "business", label: "SI Business" },
  { value: "cooperation", label: "Cooperation" },
  { value: "marketing", label: "Marketing" },
  { value: "etc", label: "etc" },
];

export function MemoForm() {
  const [state, formAction, pending] = useActionState(createMemo, initialState);
  const [, startSubmit] = useTransition();
  // 첨부파일은 제출 시점에 브라우저가 Storage로 직접 올리고, 서버 액션에는
  // 그 위치만 넘긴다 — 이유는 lib/attachmentPolicy.ts 맨 위 주석 참고.
  const upload = useAttachmentUpload("memo");
  const busy = pending || upload.uploading;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const formData = new FormData(e.currentTarget);
    if (!(await upload.attachTo(formData))) return;
    startSubmit(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      <div className="field">
        <label htmlFor="category">구분</label>
        <select id="category" name="category" required defaultValue="" className="input" style={{ maxWidth: 240 }}>
          <option value="" disabled>
            선택
          </option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="title">제목</label>
        <input id="title" name="title" type="text" required maxLength={200} placeholder="제목을 입력하세요" className="input" />
      </div>

      <div className="field">
        <label htmlFor="content">내용</label>
        <textarea id="content" name="content" required rows={10} placeholder="내용을 입력하세요" className="input" />
      </div>

      <div className="field">
        <label>파일첨부</label>
        <AttachmentPicker service="memo" files={upload.files} onChange={upload.setFiles} disabled={busy} />
      </div>

      {(state?.error || upload.uploadError) && (
        <p style={{ fontSize: 13, color: "var(--color-accent-900)" }}>{upload.uploadError ?? state?.error}</p>
      )}
      <AttachmentProgress progress={upload.progress} />

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button type="submit" disabled={busy} className="btn btn-primary blueprint">
          {upload.uploading ? "업로드 중..." : pending ? "저장 중..." : "등록"}
        </button>
        <Link href="/dashboard/memos" className="btn btn-ghost">
          취소
        </Link>
      </div>
    </form>
  );
}
