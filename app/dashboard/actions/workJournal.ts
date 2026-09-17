"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeamAfterResponseAs } from "@/lib/notifyTeam";
import {
  deleteAttachmentFromDrive,
  driveFileViewUrl,
  isGoogleDriveAttachmentsConfigured,
  uploadAttachmentToDrive,
} from "@/lib/googleDriveAttachments";
import { safeStorageFileName } from "@/lib/storageKey";

const PATH = "/dashboard/work-journal";
const BUCKET = "journal-attachments";

// 첨부파일 업로드 제약은 Memo Board와 동일(이미지/PDF/Office 문서/ZIP, 12MB, 최대 5개) —
// 첨부 제약 정책을 앱 전체에서 통일한다(사용자 확인, 2026-08-23 Memo Board 논의 참고).
const ATTACHMENT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
];
const ATTACHMENT_MAX_SIZE = 12 * 1024 * 1024;
const ATTACHMENT_MAX_COUNT = 5;

function validateFiles(files: File[]): string | null {
  if (files.length > ATTACHMENT_MAX_COUNT) {
    return `첨부파일은 한 번에 최대 ${ATTACHMENT_MAX_COUNT}개까지 올릴 수 있습니다.`;
  }
  for (const file of files) {
    if (!ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
      return `${file.name}: 이미지·PDF·Office 문서·ZIP 파일만 올릴 수 있습니다.`;
    }
    if (file.size > ATTACHMENT_MAX_SIZE) {
      return `${file.name}: 파일은 12MB 이하만 올릴 수 있습니다.`;
    }
  }
  return null;
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

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const fileError = validateFiles(files);
  if (fileError) return { error: fileError };

  // 일지 저장과 "구글드라이브가 설정돼 있는지"(DB 조회) 확인은 서로 무관하니
  // 나란히 보낸다 — 첨부가 없으면 아예 확인하지 않는다(2026-09-17).
  const [{ data: entry, error }, useDrive] = await Promise.all([
    supabase.from("work_journal_entries").insert(fields).select("id").single(),
    files.length > 0 ? isGoogleDriveAttachmentsConfigured() : Promise.resolve(false),
  ]);
  if (error || !entry) return { error: `저장 실패: ${error?.message ?? "알 수 없는 오류"}` };

  // 예전엔 파일 하나를 올리고 그 행을 insert한 뒤 다음 파일로 넘어가서, 첨부
  // 5개(상한)면 업로드 5회 + insert 5회가 순서대로 쌓였다 — 업로드는 나란히
  // 하고 행은 한 번에 insert한다(2026-09-17). 개별 파일 실패는 예전처럼
  // 조용히 건너뛰고 일지 저장 자체는 성공으로 둔다.
  if (files.length > 0) {
    const rows = await Promise.all(
      files.map(async (file) => {
        if (useDrive) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const fileId = await uploadAttachmentToDrive("journal", file.name, bytes, file.type).catch((e) => {
            console.error(`[createWorkJournalEntry] 첨부파일 업로드 실패 (${file.name}):`, e instanceof Error ? e.message : e);
            return null;
          });
          if (!fileId) return null;
          return {
            entry_id: entry.id,
            file_name: file.name,
            content_type: file.type,
            drive_file_id: fileId,
            storage_path: null,
          };
        }
        const path = `${entry.id}/${safeStorageFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
        });
        if (uploadError) {
          console.error(`[createWorkJournalEntry] 첨부파일 업로드 실패 (${file.name}):`, uploadError.message);
          return null;
        }
        return {
          entry_id: entry.id,
          file_name: file.name,
          content_type: file.type,
          drive_file_id: null,
          storage_path: path,
        };
      })
    );
    const inserted = rows.filter((r): r is NonNullable<typeof r> => r !== null);
    if (inserted.length > 0) await supabase.from("work_journal_attachments").insert(inserted);
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

  const { error } = await supabase
    .from("work_journal_entries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: `저장 실패: ${error.message}` };

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
