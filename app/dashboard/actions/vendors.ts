"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractVendorInfoFromDocument } from "@/lib/vendorDocumentAi";
import type { VendorDocumentType } from "@/lib/queries/vendors";
import { deleteAttachmentFromDrive } from "@/lib/googleDriveAttachments";
import {
  ATTACHMENT_POLICY,
  asFileLike,
  parseUploadedAttachments,
  validateAttachmentFiles,
} from "@/lib/attachmentPolicy";

const PATH = "/dashboard/vendors";
const DOCUMENTS_BUCKET = ATTACHMENT_POLICY.vendor.bucket;

/** 서류 실물(Storage/구글드라이브)을 응답 이후에 지운다(2026-09-17) — DB 행이
 * 사라진 뒤 하는 뒷정리라 삭제 버튼을 누른 사람이 기다릴 필요가 없다(Memo
 * Board·Work Journal과 같은 처리). after() 안에서는 세션 쿠키를 다시 쓸 수
 * 없어 service_role 클라이언트로 지운다(지울 경로는 이미 응답 전에 권한이
 * 확인된 행에서 읽어온 값). */
function cleanUpVendorFilesAfterResponse(
  documents: { storage_path: string | null; drive_file_id: string | null }[]
): void {
  const legacyPaths = documents.map((d) => d.storage_path).filter((p): p is string => Boolean(p));
  const driveIds = documents.map((d) => d.drive_file_id).filter((i): i is string => Boolean(i));
  if (legacyPaths.length === 0 && driveIds.length === 0) return;

  after(async () => {
    try {
      await Promise.all([
        legacyPaths.length ? createAdminClient().storage.from(DOCUMENTS_BUCKET).remove(legacyPaths) : Promise.resolve(),
        ...driveIds.map((fileId) => deleteAttachmentFromDrive(fileId)),
      ]);
    } catch (e) {
      console.error("[vendors] 서류 파일 정리 실패:", e instanceof Error ? e.message : e);
    }
  });
}

export type VendorFormState = { error?: string } | undefined;

export async function saveVendor(_prevState: VendorFormState, formData: FormData): Promise<VendorFormState> {
  const { supabase } = await requireAuthedClient();

  const id = String(formData.get("id") ?? "") || null;
  const companyName = String(formData.get("companyName") ?? "").trim();
  if (!companyName) return { error: "업체명을 입력하세요." };

  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;
  const fields = {
    company_name: companyName,
    business_number: text("businessNumber"),
    representative_name: text("representativeName"),
    business_type: text("businessType"),
    business_item: text("businessItem"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    bank_name: text("bankName"),
    account_number: text("accountNumber"),
    account_holder: text("accountHolder"),
    contact_name: text("contactName"),
    contact_title: text("contactTitle"),
    contact_phone: text("contactPhone"),
    contact_email: text("contactEmail"),
    notes: text("notes"),
  };

  const { error } = id
    ? await supabase
        .from("partner_vendors")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
    : await supabase.from("partner_vendors").insert(fields);

  if (error) return { error: `저장 실패: ${error.message}` };

  revalidatePath(PATH);
  return undefined;
}

export async function deleteVendor(id: string): Promise<void> {
  const { supabase } = await requireAuthedClient();

  // 서류 행은 제조사 삭제 시 cascade로 함께 지워지므로 파일 경로만 미리 읽어둔다.
  const { data: documents } = await supabase
    .from("vendor_documents")
    .select("storage_path, drive_file_id")
    .eq("vendor_id", id);

  await supabase.from("partner_vendors").delete().eq("id", id);
  cleanUpVendorFilesAfterResponse(documents ?? []);

  revalidatePath(PATH);
}

export type UploadVendorDocumentResult =
  | { ok: true; vendorId: string; extracted: Record<string, string> }
  | { ok: false; error: string };

/** 문서를 업로드하고 AI로 정보를 추출한다. vendorId가 없으면(신규 등록 전 업로드) 추출된
 * 업체명(또는 파일명)으로 새 협력사를 먼저 만든 뒤 그 협력사에 문서를 붙인다. */
export async function uploadVendorDocument(formData: FormData): Promise<UploadVendorDocumentResult> {
  const { supabase } = await requireAuthedClient();

  // 파일 바이트는 브라우저가 이미 Storage에 올려뒀고 여기엔 위치만 온다
  // (lib/attachmentPolicy.ts 맨 위 주석 참고 — Vercel 4.5MB 상한 우회).
  const uploaded = parseUploadedAttachments(formData)[0];
  const documentType = String(formData.get("documentType") ?? "") as VendorDocumentType;
  let vendorId = String(formData.get("vendorId") ?? "") || null;

  /** 중단할 때 이미 올라간 파일을 함께 정리한다(고아 파일 방지). */
  const fail = (error: string): UploadVendorDocumentResult => {
    if (uploaded) {
      after(async () => {
        try {
          await createAdminClient().storage.from(DOCUMENTS_BUCKET).remove([uploaded.path]);
        } catch (e) {
          console.error("[uploadVendorDocument] 미사용 파일 정리 실패:", e instanceof Error ? e.message : e);
        }
      });
    }
    return { ok: false, error };
  };

  if (!uploaded) return { ok: false, error: "파일을 선택하세요." };
  if (!["business_registration", "bankbook", "business_card", "product_material"].includes(documentType)) {
    return fail("잘못된 문서 종류입니다.");
  }
  const fileError = validateAttachmentFiles("vendor", asFileLike([uploaded]));
  if (fileError) return fail(fileError);

  // 제품자료는 업체 정보 추출 대상이 아니라 AI 호출 자체를 건너뛴다(카탈로그
  // 이미지에서 사업자번호 같은 값을 억지로 읽어내려 하지 않도록) — 그래서
  // 파일을 내려받을 필요도 없다. 추출이 필요한 종류일 때만 Storage에서
  // 바이트를 받아온다(예전엔 폼이 바이트를 실어 보냈다).
  let extracted: Record<string, string> = {};
  if (documentType !== "product_material") {
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(uploaded.path);
      if (downloadError || !blob) throw new Error(downloadError?.message ?? "파일을 읽지 못했습니다.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      extracted = await extractVendorInfoFromDocument(bytes, uploaded.contentType, documentType);
    } catch (e) {
      // AI 추출 실패해도 파일 등록 자체는 계속 진행한다(기존 동작 유지).
      extracted = {};
      console.error("[uploadVendorDocument] AI 추출 실패:", e instanceof Error ? e.message : e);
    }
  }

  if (!vendorId) {
    const fallbackName = uploaded.fileName.replace(/\.[^.]+$/, "").trim().slice(0, 120) || "새 제조사";
    const { data: created, error: createError } = await supabase
      .from("partner_vendors")
      .insert({ company_name: extracted.companyName || fallbackName })
      .select("id")
      .single();
    if (createError || !created) {
      return fail(`제조사 등록 실패: ${createError?.message ?? "알 수 없는 오류"}`);
    }
    vendorId = created.id;
  }

  const { error: insertError } = await supabase.from("vendor_documents").insert({
    vendor_id: vendorId,
    document_type: documentType,
    original_name: uploaded.fileName,
    storage_path: uploaded.path,
  });
  if (insertError) return fail(`업로드 실패: ${insertError.message}`);

  revalidatePath(PATH);
  return { ok: true, vendorId, extracted };
}

export async function deleteVendorDocument(documentId: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  // 행을 지우면서 그 행의 파일 정보를 응답으로 함께 받아온다 — 조회 → 파일
  // 삭제 → 행 삭제로 줄줄이 기다리던 것을 한 번의 왕복으로(2026-09-17).
  const { data: deleted } = await supabase
    .from("vendor_documents")
    .delete()
    .eq("id", documentId)
    .select("storage_path, drive_file_id")
    .maybeSingle();
  if (deleted) cleanUpVendorFilesAfterResponse([deleted]);
  revalidatePath(PATH);
}
