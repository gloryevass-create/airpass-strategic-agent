import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Client = SupabaseClient<Database>;

export type WorkJournalAttachment = {
  id: string;
  fileName: string;
  contentType: string | null;
  storagePath: string | null;
  driveFileId: string | null;
};

export type WorkJournalEntry = {
  id: string;
  /** 이 행을 실제로 등록한 사람. 화면에 보이는 authorName("누구의 업무인지")과
   * 다를 수 있다 — 수정·삭제 권한은 이쪽을 따른다(0083). 2026-10-04 이전에
   * 등록돼 이름이 profiles와 매칭되지 않은 행은 null일 수 있다(관리자만 수정 가능). */
  authorId: string | null;
  authorName: string;
  weekLabel: string | null;
  entryDate: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachments: WorkJournalAttachment[];
};

// work_journal_entries는 이 대시보드가 직접 쓰는(Notion 연동 없는) 업무일지
// 데이터라 admin 캐싱 없이 요청자의 세션 클라이언트로 매번 최신값을 읽는다
// (product_catalog/cooperation_projects와 동일한 패턴). 첨부파일은 목록 단계에서는
// signed URL 없이 메타데이터만 가져오고(수백 건 한번에 서명하면 느려짐), 실제
// 다운로드 링크는 항목을 펼칠 때 별도 액션(getWorkJournalAttachmentUrls)으로 받는다.
export async function getWorkJournalEntries(supabase: Client): Promise<WorkJournalEntry[]> {
  const [{ data: entries }, { data: attachments }] = await Promise.all([
    supabase
      .from("work_journal_entries")
      .select("*")
      .order("entry_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("work_journal_attachments").select("*"),
  ]);

  const attachmentsByEntry = new Map<string, WorkJournalAttachment[]>();
  for (const a of attachments ?? []) {
    const list = attachmentsByEntry.get(a.entry_id) ?? [];
    list.push({
      id: a.id,
      fileName: a.file_name,
      contentType: a.content_type,
      storagePath: a.storage_path,
      driveFileId: a.drive_file_id,
    });
    attachmentsByEntry.set(a.entry_id, list);
  }

  return (entries ?? []).map((e) => ({
    id: e.id,
    authorId: e.author_id,
    authorName: e.author_name,
    weekLabel: e.week_label,
    entryDate: e.entry_date,
    content: e.content,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
    attachments: attachmentsByEntry.get(e.id) ?? [],
  }));
}
