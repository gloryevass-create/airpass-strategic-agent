"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WorkJournalEntry } from "@/lib/queries/workJournal";
import {
  createWorkJournalEntry,
  updateWorkJournalEntry,
  deleteWorkJournalEntry,
  deleteWorkJournalAttachment,
  getWorkJournalAttachmentUrls,
} from "@/app/dashboard/actions/workJournal";
import { uploadWorkJournalFiles, deleteUploadedWorkJournalFiles } from "@/lib/workJournalUpload";
import {
  WORK_JOURNAL_ALLOWED_TYPES,
  WORK_JOURNAL_ATTACHMENT_HINT,
  WORK_JOURNAL_MAX_COUNT,
  formatFileSize,
  validateAttachmentFile,
  validateAttachmentFiles,
} from "@/lib/workJournalAttachments";

// Business/Cooperation/Marketing과 같은 Claude Design "Industry" 테마를 그대로
// 적용했다(2026-08-29). 데이터·서버 액션은 기존 Work Journal 그대로, 화면만
// 새로 그렸다 — 새 메뉴를 만들지 않고 그 자리에서 다시 그린 것(Calendar와 동일한
// 방식). 목업의 **굵게**/~~취소선~~/체크박스 표시는 순수 렌더링 단계에서만
// 적용한다(저장되는 content는 그대로 평문).
const TOKEN_REGEX = /(\*\*.+?\*\*|~~.+?~~)/g;

type Token = { text: string; bold: boolean; strike: boolean };

function tokenizeLine(rawLine: string): Token[] {
  let text = rawLine;
  if (text.startsWith("- [x] ")) text = "☑ " + text.slice(6);
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;
  while ((m = TOKEN_REGEX.exec(text))) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index), bold: false, strike: false });
    const seg = m[0];
    if (seg.startsWith("**")) tokens.push({ text: seg.slice(2, -2), bold: true, strike: false });
    else tokens.push({ text: seg.slice(2, -2), bold: false, strike: true });
    last = TOKEN_REGEX.lastIndex;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), bold: false, strike: false });
  if (tokens.length === 0) tokens.push({ text: "", bold: false, strike: false });
  return tokens;
}

function RenderLine({ line }: { line: string }) {
  return (
    <p style={{ margin: "0 0 6px", paddingLeft: "var(--space-3)", fontSize: 15, lineHeight: 1.65, minHeight: "1em" }}>
      {tokenizeLine(line).map((tok, i) =>
        tok.bold ? <b key={i}>{tok.text}</b> : tok.strike ? <s key={i}>{tok.text}</s> : <span key={i}>{tok.text}</span>
      )}
    </p>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function isImage(contentType: string | null): boolean {
  return Boolean(contentType?.startsWith("image/"));
}

/** 날짜에서 "26년 08월" 형식의 기본 주차 라벨을 만든다(실제 등록된 값들의
 * 형식과 동일). 사용자가 직접 다른 문구로 바꾸면 그 뒤로는 날짜를 바꿔도
 * 자동 채움이 그 값을 덮어쓰지 않는다(마지막 자동 채움 값과 같을 때만 갱신). */
function weekLabelFromDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m] = dateStr.split("-");
  if (!y || !m) return "";
  return `${y.slice(2)}년 ${m}월`;
}

/* ─────────────────────────── 파일 선택(누적 + 드래그앤드롭) ─────────────────────────── */

/** 네이티브 <input type="file" multiple>은 "한 번에 여러 개"는 고를 수 있지만
 * 탐색창을 다시 열면 앞서 고른 것이 **교체**된다 — 그래서 서로 다른 폴더에 있는
 * 파일을 모아 붙일 방법이 없었다(사용자 지적, 2026-09-29: "같은 폴더 안에 있는
 * 것만 가능"). 고른 파일을 React state에 쌓아두고 input은 매번 비워서, 여러 번
 * 나눠 고르든 드래그해서 떨어뜨리든 계속 누적되게 한다. */
function FilePicker({
  files,
  onChange,
  existingCount,
  disabled,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  existingCount: number;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 드래그가 자식 요소 위를 지날 때마다 dragleave가 떠서 테두리가 깜빡이므로
  // 들어온/나간 횟수를 세서 0이 될 때만 해제한다.
  const dragDepth = useRef(0);

  const remaining = WORK_JOURNAL_MAX_COUNT - existingCount - files.length;

  function keyOf(f: File) {
    return `${f.name}|${f.size}|${f.lastModified}`;
  }

  function addFiles(incoming: File[]) {
    if (incoming.length === 0) return;
    const seen = new Set(files.map(keyOf));
    const fresh = incoming.filter((f) => !seen.has(keyOf(f)));
    const skipped = incoming.length - fresh.length;

    const rejected = fresh.map(validateAttachmentFile).find(Boolean);
    if (rejected) {
      setError(rejected);
      return;
    }
    const countError = validateAttachmentFiles(fresh, existingCount + files.length);
    if (countError) {
      setError(countError);
      return;
    }
    setError(skipped > 0 ? `이미 추가된 파일 ${skipped}개는 건너뛰었습니다.` : null);
    onChange([...files, ...fresh]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    addFiles(Array.from(e.dataTransfer.files));
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
        onDrop={handleDrop}
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
          padding: "var(--space-5) var(--space-4)",
          textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          transition: "background 120ms, border-color 120ms",
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-700)" }}>
          파일을 이 영역에 끌어다 놓거나, 눌러서 선택하세요
        </p>
        <p className="text-muted" style={{ margin: "var(--space-1) 0 0", fontSize: 12 }}>
          {WORK_JOURNAL_ATTACHMENT_HINT}
          {remaining > 0 ? ` · ${remaining}개 더 추가 가능` : " · 더 추가할 수 없습니다"}
        </p>
        <p className="text-muted" style={{ margin: "var(--space-1) 0 0", fontSize: 12 }}>
          여러 번 나눠서 고르면 계속 쌓입니다(다른 폴더의 파일도 함께).
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={WORK_JOURNAL_ALLOWED_TYPES.join(",")}
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

/* ─────────────────────────── 작성/수정 폼(인라인 카드) ─────────────────────────── */

function EntryForm({
  entry,
  members,
  currentUserName,
  onDone,
}: {
  entry: WorkJournalEntry | null;
  members: string[];
  currentUserName: string | null;
  onDone: (saved: boolean) => void;
}) {
  const action = entry ? updateWorkJournalEntry.bind(null, entry.id) : createWorkJournalEntry;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPendingRef = useRef(false);
  const [, startSubmit] = useTransition();

  // 첨부파일은 폼 제출 시점에 브라우저가 Storage로 직접 올리고(아래 handleSubmit),
  // 서버 액션에는 그 위치만 넘긴다 — 이유는 lib/workJournalUpload.ts 주석 참고.
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // 서버 저장이 실패하면 이미 올라간 파일이 쓸 데 없이 남으므로 지울 수 있게 들고 있는다.
  const lastUploadedPathsRef = useRef<string[]>([]);

  const busy = pending || uploading;

  useEffect(() => {
    if (wasPendingRef.current && !pending) {
      if (state?.error) {
        // 저장이 막혔다 — 방금 올린 파일은 붙을 곳이 없으니 정리한다.
        void deleteUploadedWorkJournalFiles(lastUploadedPathsRef.current);
        lastUploadedPathsRef.current = [];
      } else {
        onDone(true);
      }
    }
    wasPendingRef.current = pending;
  }, [pending, state, onDone]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const formData = new FormData(e.currentTarget);
    setUploadError(null);

    if (pickedFiles.length > 0) {
      setUploading(true);
      setProgress({ done: 0, total: pickedFiles.length });
      const { uploaded, error } = await uploadWorkJournalFiles(pickedFiles, (done, total) =>
        setProgress({ done, total })
      );
      setUploading(false);
      setProgress(null);
      if (error) {
        setUploadError(error);
        return;
      }
      lastUploadedPathsRef.current = uploaded.map((u) => u.path);
      formData.set("uploadedAttachments", JSON.stringify(uploaded));
    } else {
      lastUploadedPathsRef.current = [];
    }

    startSubmit(() => formAction(formData));
  }

  const initialDate = entry?.entryDate ?? new Date().toISOString().slice(0, 10);
  const hasManualWeek = Boolean(entry?.weekLabel);
  const [week, setWeek] = useState(hasManualWeek ? entry!.weekLabel! : weekLabelFromDate(initialDate));
  // 날짜를 바꿀 때마다 주차 라벨을 자동으로 채우되, 사용자가 이미 직접 다른
  // 문구를 입력했다면(기존 일지를 수정할 때, 또는 새로 작성 중 직접 고쳤을 때)
  // 그 이후로는 날짜를 바꿔도 자동 채움이 덮어쓰지 않는다.
  const weekModeRef = useRef<"auto" | "manual">(hasManualWeek ? "manual" : "auto");

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (weekModeRef.current === "auto") setWeek(weekLabelFromDate(e.target.value));
  }

  function handleWeekChange(e: React.ChangeEvent<HTMLInputElement>) {
    weekModeRef.current = "manual";
    setWeek(e.target.value);
  }

  return (
    <div className="card blueprint elev-md" style={{ marginBottom: "var(--space-6)", padding: "var(--space-6) var(--space-8)", background: "#ffffff" }}>
      <div className="card-kicker">{entry ? "일지 수정" : "새 일지 작성"}</div>
      <form onSubmit={handleSubmit} style={{ marginTop: "var(--space-3)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>작성자 *</label>
            <select className="input" name="authorName" required defaultValue={entry?.authorName ?? currentUserName ?? ""}>
              <option value="" disabled>
                선택
              </option>
              {members.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>주차 라벨</label>
            <input className="input" name="weekLabel" placeholder="예: 26년 02월 1~2주차" value={week} onChange={handleWeekChange} />
          </div>
          <div className="field">
            <label>날짜</label>
            <input className="input" type="date" name="entryDate" defaultValue={initialDate} onChange={handleDateChange} />
          </div>
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label>내용 *</label>
          <textarea className="input" name="content" required rows={5} defaultValue={entry?.content ?? ""} />
        </div>
        <div className="field" style={{ marginTop: "var(--space-3)" }}>
          <label>파일첨부</label>
          <FilePicker
            files={pickedFiles}
            onChange={setPickedFiles}
            existingCount={entry?.attachments.length ?? 0}
            disabled={busy}
          />
          {entry && entry.attachments.length > 0 && (
            <div style={{ marginTop: "var(--space-2)" }}>
              <p className="text-muted" style={{ fontSize: 12, margin: "0 0 var(--space-1)" }}>
                기존 첨부파일
              </p>
              <AttachmentList entry={entry} />
            </div>
          )}
        </div>
        {(state?.error || uploadError) && (
          <p style={{ color: "var(--color-accent-900)", fontSize: 13, marginTop: "var(--space-2)" }}>
            {uploadError ?? state?.error}
          </p>
        )}
        {progress && (
          <p className="text-muted" style={{ fontSize: 13, marginTop: "var(--space-2)" }}>
            첨부파일 업로드 중... ({progress.done}/{progress.total})
          </p>
        )}
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
          <button type="submit" className="btn btn-primary blueprint" disabled={busy}>
            {uploading ? "업로드 중..." : pending ? "저장 중..." : entry ? "수정 저장" : "일지 추가"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onDone(false)}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─────────────────────────── 첨부파일 ─────────────────────────── */

/** 카드가 접혀 있어도(펼치지 않아도) 첨부파일명·링크가 바로 보여야 한다는 피드백으로
 * (2026-09-03) 클릭해서 불러오는 방식을 없애고 항상 마운트 시 바로 불러온다 — 목록
 * 카드와 수정 폼 양쪽에서 동일하게 쓴다. */
function AttachmentList({ entry }: { entry: WorkJournalEntry }) {
  const [urls, setUrls] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true);
    getWorkJournalAttachmentUrls(
      entry.attachments.map((a) => ({ id: a.id, storagePath: a.storagePath, driveFileId: a.driveFileId }))
    ).then((result) => {
      setUrls(result);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleDelete(attachmentId: string) {
    if (!window.confirm("이 첨부파일을 삭제할까요?")) return;
    startTransition(() => {
      void deleteWorkJournalAttachment(attachmentId);
    });
  }

  if (entry.attachments.length === 0) return null;

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      {loading && !urls && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          첨부파일 불러오는 중...
        </p>
      )}
      {urls && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          {entry.attachments.map((a) => {
            const url = urls[a.id];
            return (
              <div
                key={a.id}
                className="tag tag-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {url ? (
                  isImage(a.contentType) ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={a.fileName} style={{ width: 16, height: 16, objectFit: "cover" }} />
                      <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.fileName}</span>
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📎 {a.fileName}
                    </a>
                  )
                ) : (
                  <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.fileName}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  style={{ background: "none", border: 0, padding: 0, color: "var(--color-accent-900)", cursor: "pointer", font: "inherit" }}
                  aria-label="첨부파일 삭제"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 항목 카드 ─────────────────────────── */

function EntryCard({ entry, onEdit }: { entry: WorkJournalEntry; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const lines = useMemo(() => entry.content.split("\n"), [entry.content]);
  const hasMultipleLines = lines.length > 1;
  // 접혀 있을 때는 그냥 lines[0]이 아니라 내용이 있는 첫 줄을 보여준다 —
  // 내용이 빈 줄로 시작하면 미리보기가 통째로 빈 것처럼 보이는 문제가 있었다.
  const firstNonEmptyLine = lines.find((l) => l.trim()) ?? "";
  const displayLines = expanded ? lines : [firstNonEmptyLine];

  function handleDelete() {
    if (!window.confirm("이 업무일지를 삭제하시겠습니까?")) return;
    startTransition(() => {
      void deleteWorkJournalEntry(entry.id);
    });
  }

  return (
    <div className="card blueprint elev-sm" style={{ marginBottom: "var(--space-4)", padding: "var(--space-5)", background: "#ffffff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", padding: "var(--space-2) 0", marginBottom: "var(--space-3)" }}>
        <span className="tag tag-accent">{entry.authorName}</span>
        {entry.weekLabel && <span className="tag tag-outline">{entry.weekLabel}</span>}
        <span className="text-muted" style={{ fontSize: 13 }}>
          {formatDate(entry.entryDate)}
        </span>
        {entry.attachments.length > 0 && (
          <span className="tag tag-neutral" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            {entry.attachments.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {hasMultipleLines && (
          <button type="button" className="btn btn-ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "접기 ▲" : "펼치기 ▼"}
          </button>
        )}
        <button type="button" className="btn btn-secondary blueprint" onClick={onEdit}>
          수정
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleDelete}>
          삭제
        </button>
      </div>
      {displayLines.map((line, i) => (
        <RenderLine key={i} line={line} />
      ))}
      {entry.attachments.length > 0 && <AttachmentList entry={entry} />}
    </div>
  );
}

/* ─────────────────────────── 메인 보드 ─────────────────────────── */

export function IndustryWorkJournalBoard({
  entries,
  members,
  currentUserName,
}: {
  entries: WorkJournalEntry[];
  members: string[];
  currentUserName: string | null;
}) {
  const [authorFilter, setAuthorFilter] = useState("전체");
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function closeForm(saved: boolean, wasNew: boolean) {
    setEditingId(null);
    if (!saved) return;
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMessage(wasNew ? "일지가 등록되었습니다." : "일지가 수정되었습니다.");
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), 3000);
  }

  const authors = useMemo(() => {
    const set = new Set([...members, ...entries.map((e) => e.authorName)]);
    return ["전체", ...Array.from(set).sort()];
  }, [members, entries]);

  const filtered = useMemo(
    () => (authorFilter === "전체" ? entries : entries.filter((e) => e.authorName === authorFilter)),
    [entries, authorFilter]
  );

  const editingEntry = editingId && editingId !== "new" ? (entries.find((e) => e.id === editingId) ?? null) : null;

  // 알림벨/푸시 알림에서 "?open=id"로 들어오면 목록만 보여주지 말고 그 일지를
  // 바로 연다(2026-09-16, 사용자 요청 — app/dashboard/actions/workJournal.ts가
  // 알림 링크에 이 쿼리를 실어 보낸다). 연 뒤에는 쿼리를 지워서 새로고침해도
  // 같은 폼이 다시 안 뜨게 한다.
  const router = useRouter();
  const searchParams = useSearchParams();
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    if (entries.some((e) => e.id === openId)) setEditingId(openId);
    router.replace("/dashboard/work-journal");
  }, [searchParams, entries, router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="board-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1180, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>Work Journal</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        팀원별 주차 업무 일지를 관리합니다.
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        <div className="seg" style={{ flexWrap: "wrap", background: "#ffffff" }}>
          {authors.map((a) => (
            <button
              key={a}
              type="button"
              className={`seg-opt${authorFilter === a ? " active" : ""}`}
              style={{ border: 0 }}
              onClick={() => {
                setAuthorFilter(a);
                setEditingId(null);
              }}
            >
              {a}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary blueprint" onClick={() => setEditingId("new")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          새 일지 추가
        </button>
      </div>

      {successMessage && (
        <div
          className="card blueprint"
          style={{
            marginBottom: "var(--space-4)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-accent-100)",
            color: "var(--color-accent-900)",
            fontSize: 13,
          }}
        >
          {successMessage}
        </div>
      )}

      {editingId === "new" && (
        <EntryForm entry={null} members={members} currentUserName={currentUserName} onDone={(saved) => closeForm(saved, true)} />
      )}
      {editingEntry && (
        <EntryForm entry={editingEntry} members={members} currentUserName={currentUserName} onDone={(saved) => closeForm(saved, false)} />
      )}

      {filtered.length === 0 ? (
        <div className="card blueprint" style={{ padding: "var(--space-8)", textAlign: "center" }}>
          <p className="text-muted" style={{ margin: 0 }}>
            등록된 업무일지가 없습니다.
          </p>
        </div>
      ) : (
        filtered.map((e) => <EntryCard key={e.id} entry={e} onEdit={() => setEditingId(e.id)} />)
      )}
      </div>
    </div>
  );
}
