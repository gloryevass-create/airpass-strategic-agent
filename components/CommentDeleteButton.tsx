"use client";

import { useTransition } from "react";

/** 댓글 삭제 버튼 — Memo Board·Meeting Notes·AI Review 상세 화면이 함께 쓴다.
 *
 * 세 화면은 서버 컴포넌트라 onClick을 직접 달 수 없어서, 각 화면이 자기
 * 삭제 서버 액션을 action prop으로 넘기고 이 클라이언트 컴포넌트가 호출한다.
 * 버튼 자체를 권한이 있을 때만 렌더링하는 건 호출부 책임이고, 실제 차단은
 * 서버 액션과 RLS(0084)가 한다. */
export function CommentDeleteButton({
  commentId,
  action,
}: {
  commentId: string;
  action: (commentId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("이 의견을 삭제할까요?")) return;
        startTransition(() => {
          void action(commentId);
        });
      }}
      style={{
        background: "none",
        border: 0,
        padding: 0,
        color: "var(--color-accent-900, #1d2d3d)",
        cursor: pending ? "default" : "pointer",
        font: "inherit",
        fontSize: 11,
        opacity: pending ? 0.5 : 1,
      }}
    >
      {pending ? "삭제 중..." : "삭제"}
    </button>
  );
}
