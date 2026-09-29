"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeamAfterResponseAs } from "@/lib/notifyTeam";
import { deleteAttachmentFromDrive, driveFileViewUrl } from "@/lib/googleDriveAttachments";
import {
  WORK_JOURNAL_BUCKET,
  validateAttachmentFiles,
  type UploadedAttachment,
} from "@/lib/workJournalAttachments";

const PATH = "/dashboard/work-journal";
const BUCKET = WORK_JOURNAL_BUCKET;

/** 첨부파일은 2026-09-29부터 **브라우저가 Supabase Storage로 직접 올리고**, 이
 * 액션은 "어디에 올렸는지"만 받아 DB 행을 만든다 — 이유는
 * lib/workJournalUpload.ts의 주석 참고(Server Action 1MB / Vercel 4.5MB 상한을
 * 우회해 20MB 첨부를 가능하게 하려면 이 방법뿐이다).
 *
 * 그래서 여기서 검사하는 크기·형식은 브라우저가 알려준 값이다. 진짜로 거부하는
 * 쪽은 Storage 버킷의 file_size_limit/allowed_mime_types(마이그레이션 0081)다.
 * 이 검사는 DB에 들어가는 값이 화면 안내와 어긋나지 않게 하는 용도. */
function uploadedFromForm(formData: FormData): UploadedAttachment[] {
  const raw = String(formData.get("uploadedAttachments") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const { path, fileName, contentType, size } = item as Record<string, unknown>;
      if (typeof path !== "string" || !path || typeof fileName !== "string" || !fileName) return [];
      return [{
        path,
        fileName,
        contentType: typeof contentType === "string" ? contentType : "",
        size: typeof size === "number" ? size : 0,
      }];
    });
  } catch {
    return [];
  }
}

function attachmentRows(entryId: string, uploaded: UploadedAttachment[]) {
  return uploaded.map((u) => ({
    entry_id: entryId,
    file_name: u.fileName,
    content_type: u.contentType || null,
    drive_file_id: null,
    storage_path: u.path,
  }));
}

/** 저장이 막히면 이미 올라간 파일이 쓸 데 없이 남으므로 지운다. 브라우저도
 * 같은 정리를 하지만(응답의 error를 보고), 서버에서 막힌 경우 브라우저가
 * 그 사이 닫혔을 수 있어 여기서도 한 번 정리한다. */
function discardUploadedFiles(uploaded: UploadedAttachment[]): void {
  if (uploaded.length === 0) return;
  after(async () => {
    try {
      await createAdminClient().storage.from(BUCKET).remove(uploaded.map((u) => u.path));
    } catch (e) {
      console.error("[workJournal] 미사용 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
    }
  });
}

export type WorkJournalFormState = { error?: string } | undefined;

function fieldsFromForm(formData: FormData) {
  return {
    author_name: String(formData.get("authorName") ?? "").trim(),
    week_label: String(formData.get("weekLabel") ?? "").trim() || null,
    entry_date: String(formData.get("entryDate") ?? "").trim() || null,
    content: String(formData.get("content") ?? "").trim(),
  };
}

export async function createWorkJournalEntry(
  _prevState: WorkJournalFormState,
  formData: FormData
): Promise<WorkJournalFormState> {
  const { supabase } = await requireAuthedClient();

  const fields = fieldsFromForm(formData);
  if (!fields.author_name) return { error: "작성자를 선택하세요." };
  if (!fields.content) return { error: "내용을 입력하세요." };

  // 브라우저가 이미 Storage에 올려둔 파일들의 위치. 검사에 걸리면 저장을
  // 시작하기 전에 그 파일부터 지운다(고아 파일 방지).
  const uploaded = uploadedFromForm(formData);
  const fileError = validateAttachmentFiles(
    uploaded.map((u) => ({ name: u.fileName, type: u.contentType, size: u.size }))
  );
  if (fileError) {
    discardUploadedFiles(uploaded);
    return { error: fileError };
  }

  const { data: entry, error } = await supabase
    .from("work_journal_entries")
    .insert(fields)
    .select("id")
    .single();
  if (error || !entry) {
    discardUploadedFiles(uploaded);
    return { error: `저장 실패: ${error?.message ?? "알 수 없는 오류"}` };
  }

  if (uploaded.length > 0) {
    const { error: attachError } = await supabase
      .from("work_journal_attachments")
      .insert(attachmentRows(entry.id, uploaded));
    // 예전엔 개별 파일 실패를 조용히 삼켰지만, 이제 바이트는 이미 다 올라간
    // 뒤라 여기서 실패하는 건 DB 문제뿐이다 — 조용히 넘기면 사용자는 첨부가
    // 붙은 줄 알게 되므로 그대로 알린다(일지 본문은 이미 저장됐다는 것도 함께).
    if (attachError) {
      discardUploadedFiles(uploaded);
      revalidatePath(PATH);
      return { error: `일지는 저장됐지만 첨부파일 연결에 실패했습니다: ${attachError.message}` };
    }
  }

  // 워크스페이스 다른 게시판(Memo Board/Meeting Notes 등)과 마찬가지로 새
  // 업무일지 작성을 팀 알림 피드에 남긴다(2026-09-16, 사용자 확인 — Work
  // Journal만 알림이 빠져있던 걸 발견). 작성자는 로그인한 본인이 아니라 폼에서
  // 고른 author_name을 그대로 쓴다(다른 팀원 몫으로 대신 기록하는 경우가
  // 있어 이게 더 정확 — 목록 상단 작성자 필터와 같은 값). 알림을 누르면
  // 목록이 아니라 이 일지가 바로 열리도록 ?open=id를 붙인다
  // (IndustryWorkJournalBoard.tsx가 마운트 시 읽음).
  const preview = fields.content.length > 40 ? `${fields.content.slice(0, 40)}...` : fields.content;
  notifyTeamAfterResponseAs({
    type: "work_journal",
    title: preview,
    message: `${fields.author_name}님이 새 업무일지를 작성했습니다.`,
    link: `${PATH}?open=${entry.id}`,
  });

  revalidatePath(PATH);
  return undefined;
}

export async function updateWorkJournalEntry(
  id: string,
  _prevState: WorkJournalFormState,
  formData: FormData
): Promise<WorkJournalFormState> {
  const { supabase } = await requireAuthedClient();

  const fields = fieldsFromForm(formData);
  if (!fields.author_name) return { error: "작성자를 선택하세요." };
  if (!fields.content) return { error: "내용을 입력하세요." };

  // 🐛 2026-09-29 수정: 예전엔 이 액션이 formData의 파일을 아예 읽지 않아
  // 수정 화면에서 첨부를 추가해도 조용히 사라졌다(오류도 안 났다). 등록과
  // 똑같이 처리한다.
  const uploaded = uploadedFromForm(formData);

  // 개수 상한은 "이미 붙어 있는 것 + 이번에 추가하는 것"으로 센다.
  const { count: existingCount } = uploaded.length
    ? await supabase
        .from("work_journal_attachments")
        .select("id", { count: "exact", head: true })
        .eq("entry_id", id)
    : { count: 0 };
  const fileError = validateAttachmentFiles(
    uploaded.map((u) => ({ name: u.fileName, type: u.contentType, size: u.size })),
    existingCount ?? 0
  );
  if (fileError) {
    discardUploadedFiles(uploaded);
    return { error: fileError };
  }

  const { error } = await supabase
    .from("work_journal_entries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    discardUploadedFiles(uploaded);
    return { error: `저장 실패: ${error.message}` };
  }

  if (uploaded.length > 0) {
    const { error: attachError } = await supabase
      .from("work_journal_attachments")
      .insert(attachmentRows(id, uploaded));
    if (attachError) {
      discardUploadedFiles(uploaded);
      revalidatePath(PATH);
      return { error: `일지는 저장됐지만 첨부파일 연결에 실패했습니다: ${attachError.message}` };
    }
  }

  revalidatePath(PATH);
  return undefined;
}

export async function deleteWorkJournalEntry(id: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  const { data: attachments } = await supabase
    .from("work_journal_attachments")
    .select("storage_path, drive_file_id")
    .eq("entry_id", id);
  await supabase.from("work_journal_entries").delete().eq("id", id);

  // 실제 파일 정리(Storage/구글드라이브)는 DB 행이 사라진 뒤 하면 되는
  // 뒷정리라 응답 이후로 미룬다(2026-09-17) — 예전엔 첨부 개수만큼의 삭제
  // 왕복을 다 기다린 다음에야 목록이 갱신됐다. 첨부 행은 cascade로 이미
  // 지워졌으므로 여기서 실패하면 파일만 남는데(고아 파일), 원래도 실패 시
  // 조용히 넘어가던 동작과 같다.
  cleanUpAttachmentFilesAfterResponse(attachments ?? []);

  revalidatePath(PATH);
}

/** 첨부파일 실물(Supabase Storage / 구글드라이브)을 응답 이후에 지운다.
 * after() 안에서는 세션 클라이언트를 쓸 수 없어(응답이 끝나 갱신 쿠키를 다시
 * 쓸 수 없음) service_role 클라이언트로 지운다 — 지울 경로는 이미 응답 전에
 * 권한이 확인된 행에서 읽어온 값이다. */
function cleanUpAttachmentFilesAfterResponse(
  attachments: { storage_path: string | null; drive_file_id: string | null }[]
): void {
  const legacyPaths = attachments.map((a) => a.storage_path).filter((p): p is string => Boolean(p));
  const driveIds = attachments.map((a) => a.drive_file_id).filter((i): i is string => Boolean(i));
  if (legacyPaths.length === 0 && driveIds.length === 0) return;

  after(async () => {
    try {
      await Promise.all([
        legacyPaths.length ? createAdminClient().storage.from(BUCKET).remove(legacyPaths) : Promise.resolve(),
        ...driveIds.map((fileId) => deleteAttachmentFromDrive(fileId)),
      ]);
    } catch (e) {
      console.error("[workJournal] 첨부파일 정리 실패:", e instanceof Error ? e.message : e);
    }
  });
}

export async function deleteWorkJournalAttachment(attachmentId: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  // 행을 지우면서 그 행의 파일 정보를 응답으로 함께 받아온다(2026-09-17) —
  // 예전엔 조회 → 파일 삭제 → 행 삭제를 줄줄이 기다렸는데, 파일 정리는
  // 뒷정리라 응답 이후로 미룰 수 있다(위 cleanUp... 주석 참고).
  const { data: deleted } = await supabase
    .from("work_journal_attachments")
    .delete()
    .eq("id", attachmentId)
    .select("storage_path, drive_file_id")
    .maybeSingle();
  if (deleted) cleanUpAttachmentFilesAfterResponse([deleted]);
  revalidatePath(PATH);
}

export type WorkJournalAttachmentRef = {
  id: string;
  storagePath: string | null;
  driveFileId: string | null;
};

/** 목록 단계에서는 URL을 만들지 않고(수백 건 한번에 서명하면 느려짐), 항목을 펼칠 때만
 * 그 항목의 첨부파일에 대해 필요한 만큼 URL을 만든다. 구글드라이브 첨부는 만료 없는
 * 고정 링크라 API 호출 없이 바로 만들고, 예전 Supabase Storage 첨부만 signed URL을
 * 새로 발급한다. 반환 키는 storage_path 대신 첨부파일 id로 통일한다(둘 중 하나만
 * 채워지는 구조라 storage_path를 키로 쓸 수 없는 경우가 생기기 때문). */
export async function getWorkJournalAttachmentUrls(
  attachments: WorkJournalAttachmentRef[]
): Promise<Record<string, string>> {
  const { supabase } = await requireAuthedClient();
  const result: Record<string, string> = {};
  await Promise.all(
    attachments.map(async (a) => {
      if (a.driveFileId) {
        result[a.id] = driveFileViewUrl(a.driveFileId);
        return;
      }
      if (!a.storagePath) return;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.storagePath, 60 * 60);
      if (data?.signedUrl) result[a.id] = data.signedUrl;
    })
  );
  return result;
}
