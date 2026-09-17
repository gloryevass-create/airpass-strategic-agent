"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractVendorInfoFromDocument } from "@/lib/vendorDocumentAi";
import type { VendorDocumentType } from "@/lib/queries/vendors";
import { deleteAttachmentFromDrive, isGoogleDriveAttachmentsConfigured, uploadAttachmentToDrive } from "@/lib/googleDriveAttachments";
import { safeStorageFileName } from "@/lib/storageKey";

const PATH = "/dashboard/vendors";
const DOCUMENTS_BUCKET = "vendor-documents";

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

  const file = formData.get("file");
  const documentType = String(formData.get("documentType") ?? "") as VendorDocumentType;
  let vendorId = String(formData.get("vendorId") ?? "") || null;

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "파일을 선택하세요." };
  }
  if (!["business_registration", "bankbook", "business_card", "product_material"].includes(documentType)) {
    return { ok: false, error: "잘못된 문서 종류입니다." };
  }
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) {
    return { ok: false, error: "JPG, PNG, WebP, PDF 파일만 올릴 수 있습니다." };
  }
  if (file.size > 12 * 1024 * 1024) {
    return { ok: false, error: "파일은 12MB 이하만 올릴 수 있습니다." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // 제품자료는 업체 정보 추출 대상이 아니라 AI 호출 자체를 건너뛴다(카탈로그
  // 이미지에서 사업자번호 같은 값을 억지로 읽어내려 하지 않도록).
  // AI 추출(가장 느린 구간)과 "구글드라이브가 설정돼 있는지"(DB 조회)는 서로
  // 무관하니 나란히 진행한다 — 예전엔 AI가 끝난 뒤에야 이 조회를 시작했다(2026-09-17).
  const useDrivePromise = isGoogleDriveAttachmentsConfigured();
  useDrivePromise.catch(() => {});

  let extracted: Record<string, string> = {};
  if (documentType !== "product_material") {
    try {
      extracted = await extractVendorInfoFromDocument(bytes, file.type, documentType);
    } catch (e) {
      // AI 추출 실패해도 파일 업로드/등록 자체는 계속 진행한다.
      extracted = {};
      console.error("[uploadVendorDocument] AI 추출 실패:", e instanceof Error ? e.message : e);
    }
  }

  if (!vendorId) {
    const fallbackName = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 120) || "새 제조사";
    const { data: created, error: createError } = await supabase
      .from("partner_vendors")
      .insert({ company_name: extracted.companyName || fallbackName })
      .select("id")
      .single();
    if (createError || !created) {
      return { ok: false, error: `제조사 등록 실패: ${createError?.message ?? "알 수 없는 오류"}` };
    }
    vendorId = created.id;
  }

  if (await useDrivePromise) {
    const fileId = await uploadAttachmentToDrive("vendor", file.name, bytes, file.type).catch((e) => {
      console.error("[uploadVendorDocument] 업로드 실패:", e instanceof Error ? e.message : e);
      return null;
    });
    if (!fileId) {
      return { ok: false, error: "업로드 실패: 구글드라이브에 파일을 올리지 못했습니다." };
    }
    await supabase.from("vendor_documents").insert({
      vendor_id: vendorId,
      document_type: documentType,
      original_name: file.name,
      drive_file_id: fileId,
    });
    revalidatePath(PATH);
    return { ok: true, vendorId, extracted };
  }

  const path = `${vendorId}/${safeStorageFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, {
    contentType: file.type,
  });
  if (uploadError) {
    return { ok: false, error: `업로드 실패: ${uploadError.message}` };
  }

  await supabase.from("vendor_documents").insert({
    vendor_id: vendorId,
    document_type: documentType,
    original_name: file.name,
    storage_path: path,
  });

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
