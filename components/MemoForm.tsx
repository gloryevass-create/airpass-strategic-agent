"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createMemo, type CreateMemoState } from "@/app/dashboard/memos/actions";

const initialState: CreateMemoState = undefined;

const CATEGORY_OPTIONS = [
  { value: "business", label: "SI Business" },
  { value: "cooperation", label: "Cooperation" },
  { value: "marketing", label: "Marketing" },
  { value: "etc", label: "etc" },
];

export function MemoForm() {
  const [state, formAction, pending] = useActionState(createMemo, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
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
        <label htmlFor="files">파일첨부</label>
        <input
          id="files"
          name="files"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
          className="input"
        />
        <p className="text-muted" style={{ fontSize: 12, margin: "var(--space-1) 0 0" }}>
          이미지·PDF·Office 문서·ZIP, 한 번에 올리는 파일 합계 4MB 이하, 최대 5개
        </p>
      </div>

      {state?.error && (
        <p style={{ fontSize: 13, color: "var(--color-accent-900)" }}>{state.error}</p>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <button type="submit" disabled={pending} className="btn btn-primary blueprint">
          {pending ? "저장 중..." : "등록"}
        </button>
        <Link href="/dashboard/memos" className="btn btn-ghost">
          취소
        </Link>
      </div>
    </form>
  );
}
