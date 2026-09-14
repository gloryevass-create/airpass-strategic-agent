"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { ensureFileShared, listMaterialFiles } from "@/lib/googleDriveMaterials";
import { sendMaterialEmail as sendMaterialEmailViaResend } from "@/lib/materialEmail";
import { DEFAULT_MATERIAL_EMAIL_SUBJECT, DEFAULT_MATERIAL_EMAIL_MESSAGE } from "@/lib/materialEmailDefaults";
import { buildMaterialEmailHtml, isVideoFileName, matchProductMaterialFiles, type MaterialEmailProductLink } from "@/lib/materialEmailTemplate";
import { getQuotation } from "@/lib/queries/quotations";
import { getMaterialEmailLogById } from "@/lib/queries/materialEmailLogs";
import type { AiMaterialEmailDraft } from "@/lib/aiCommand";

const PATH = "/dashboard/material-email";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendMaterialEmailState = { error?: string; success?: boolean } | undefined;

function parseRecipients(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

// 회사 소개자료 폴더에서 PRODUCT_MATERIAL_CATALOG 이름과 일치하는 파일만 실제
// 공유 링크로 바꾼다(사용자 확인, 2026-08-28) — 발송 시점에만 ensureFileShared를
// 호출해 불필요한 구글드라이브 권한 변경 API 호출을 피한다(미리보기에서는 안 함).
export async function resolveProductLinks(): Promise<MaterialEmailProductLink[]> {
  const files = await listMaterialFiles();
  const matched = matchProductMaterialFiles(files);
  return Promise.all(
    matched.map(async ({ label, fileId }) => {
      if (!fileId) return { label, link: null };
      const shared = await ensureFileShared(fileId);
      return { label, link: shared.link };
    })
  );
}

/** 요청 헤더에서 이 배포의 절대 origin을 구한다 — 이메일은 브라우저 밖에서
 * 열리므로 상대경로 링크(/dashboard/...)를 쓸 수 없다. */
export async function resolveBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://planning-agent.airpass.ai.kr";
}

/** 실제 발송 공통 로직 — 폼 제출(sendMaterialEmailAction)과 AI 자동발송
 * (sendMaterialEmailFromAiDraft) 양쪽이 그대로 재사용한다. */
async function performSend(
  supabase: Awaited<ReturnType<typeof requireAuthedClient>>["supabase"],
  user: Awaited<ReturnType<typeof requireAuthedClient>>["user"],
  params: {
    recipients: string[];
    subject: string;
    message: string;
    fileIds: string[];
    quotationId: string | null;
    /** 메일 하단 푸터 — 폼에서 넘어온 값(AI 자동발송처럼 안 넘기면 기본값) */
    footer?: { homepage: string; youtube: string; companyAddress: string };
  }
): Promise<SendMaterialEmailState> {
  const { recipients, subject, message, fileIds, quotationId, footer } = params;

  if (recipients.length === 0) return { error: "받는 사람 이메일을 입력하세요." };
  const invalid = recipients.find((r) => !EMAIL_RE.test(r));
  if (invalid) return { error: `이메일 주소 형식이 올바르지 않습니다: ${invalid}` };
  if (!subject) return { error: "제목을 입력하세요." };
  if (!message) return { error: "안내 내용을 입력하세요." };
  if (fileIds.length === 0 && !quotationId) return { error: "보낼 자료를 하나 이상 선택하거나 산출내역을 첨부하세요." };

  let files: { name: string; link: string; mimeType: string; iconLink: string | null }[];
  try {
    files = await Promise.all(fileIds.map((id) => ensureFileShared(id)));
  } catch (e) {
    return { error: `자료 공유 링크 생성 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}` };
  }
  const documents = files.filter((f) => !f.mimeType.startsWith("video/"));
  const videos = files.filter((f) => f.mimeType.startsWith("video/"));

  const baseUrl = await resolveBaseUrl();
  const logoUrl = `${baseUrl}/material-email-banner.png`;

  let quotation: { id: string; quoteNumber: string; customerName: string; printUrl: string } | null = null;
  if (quotationId) {
    const q = await getQuotation(supabase, quotationId);
    if (!q) return { error: "선택한 산출내역을 찾을 수 없습니다." };
    // 고객은 로그인이 안 돼 있으므로 /dashboard 안쪽 인쇄 페이지가 아니라
    // 로그인 없이 열리는 공개 페이지(app/quote/[id])로 링크를 보낸다.
    quotation = { id: q.id, quoteNumber: q.quoteNumber, customerName: q.customerName, printUrl: `${baseUrl}/quote/${q.id}` };
  }

  let productLinks: MaterialEmailProductLink[];
  try {
    productLinks = await resolveProductLinks();
  } catch (e) {
    return { error: `제품소개 자료 링크 생성 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}` };
  }

  const { data: profile } = await supabase.from("profiles").select("name, title, email, phone").eq("id", user.id).single();
  const senderName = profile?.name ?? profile?.email ?? user.email ?? "";
  const senderTitle = profile?.title ?? null;
  const senderEmail = profile?.email ?? user.email ?? "";
  const senderPhone = profile?.phone ?? null;

  // 개인 SMTP 계정이 등록돼 있으면 그 계정(+ 본인 이름 표시)으로, 없으면
  // 공용 계정(고정 표시이름)으로 보낸다(사용자 확인, 2026-09-13). 호스트/포트는
  // 개인 계정 여부와 무관하게 항상 공용 값을 쓴다(같은 회사 메일 서버).
  const host = process.env.MATERIAL_EMAIL_SMTP_HOST;
  const port = Number(process.env.MATERIAL_EMAIL_SMTP_PORT);
  if (!host || !port) return { error: "메일 서버 설정(MATERIAL_EMAIL_SMTP_HOST/PORT)이 없습니다." };

  const { data: personalSmtp } = await supabase
    .from("material_email_smtp_accounts")
    .select("smtp_user, smtp_password")
    .eq("user_id", user.id)
    .maybeSingle();

  const smtp = personalSmtp
    ? { host, port, user: personalSmtp.smtp_user, password: personalSmtp.smtp_password, fromName: senderName || null }
    : {
        host,
        port,
        user: process.env.MATERIAL_EMAIL_SMTP_USER ?? "",
        password: process.env.MATERIAL_EMAIL_SMTP_PASSWORD ?? "",
        fromName: process.env.MATERIAL_EMAIL_FROM_NAME ?? null,
      };
  if (!smtp.user || !smtp.password) {
    return { error: "메일 서버 설정(MATERIAL_EMAIL_SMTP_USER/PASSWORD)이 없습니다." };
  }

  try {
    await sendMaterialEmailViaResend({
      to: recipients,
      subject,
      message,
      senderName,
      senderTitle,
      senderEmail,
      senderPhone,
      logoUrl,
      documents,
      videos,
      quotation,
      productLinks,
      homepage: footer?.homepage,
      youtube: footer?.youtube,
      companyAddress: footer?.companyAddress,
      smtp,
    });
  } catch (e) {
    return { error: `메일 발송 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}` };
  }

  await supabase.from("material_email_logs").insert({
    sender_id: user.id,
    sender_email: senderEmail,
    recipient_emails: recipients,
    subject,
    message,
    file_names: files.map((f) => f.name),
    file_links: files.map((f) => f.link),
    quotation_id: quotation?.id ?? null,
    quotation_quote_number: quotation?.quoteNumber ?? null,
  });

  revalidatePath(PATH);
  return { success: true };
}

export async function sendMaterialEmailAction(
  _prevState: SendMaterialEmailState,
  formData: FormData
): Promise<SendMaterialEmailState> {
  const { supabase, user } = await requireAuthedClient();

  const recipients = parseRecipients(String(formData.get("recipients") ?? ""));
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const fileIds = formData.getAll("fileIds").map(String).filter(Boolean);
  const quotationId = String(formData.get("quotationId") ?? "").trim() || null;
  const footer = {
    homepage: String(formData.get("homepage") ?? "").trim(),
    youtube: String(formData.get("youtube") ?? "").trim(),
    companyAddress: String(formData.get("companyAddress") ?? "").trim(),
  };

  return performSend(supabase, user, { recipients, subject, message, fileIds, quotationId, footer });
}

/** AI 명령 입력창에서 자료메일발송을 완전 자동으로 처리한다 — 제목·내용을
 * 지정하지 않았으면 기본 안내문을, 보낼 자료를 특정하지 않았으면 전체 자료를
 * 그대로 쓴다(화면에서 쓰는 기본값과 동일, 사용자 확인 2026-08-26). 받는 사람
 * 이메일이 없거나 형식이 잘못됐으면 자동발송하지 않고 에러를 반환한다 —
 * 호출부(AiCommandBar)가 이 경우 자료메일발송 화면으로 안내한다. 산출내역
 * 첨부는 AI 명령으로는 지정할 수 없다(화면에서 직접 골라야 함, 2026-08-28). */
export async function sendMaterialEmailFromAiDraft(draft: AiMaterialEmailDraft): Promise<SendMaterialEmailState> {
  const { supabase, user } = await requireAuthedClient();

  const recipients = parseRecipients(draft.recipients);
  const subject = draft.subject.trim() || DEFAULT_MATERIAL_EMAIL_SUBJECT;
  const message = draft.message.trim() || DEFAULT_MATERIAL_EMAIL_MESSAGE;

  let allFiles;
  try {
    allFiles = await listMaterialFiles();
  } catch (e) {
    return { error: `자료 목록 조회 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}` };
  }
  if (allFiles.length === 0) return { error: "자료 폴더에 보낼 파일이 없습니다." };

  const hints = draft.fileNameHints.map((h) => h.toLowerCase().trim()).filter(Boolean);
  const matched = hints.length > 0 ? allFiles.filter((f) => hints.some((h) => f.name.toLowerCase().includes(h))) : [];
  const fileIds = (matched.length > 0 ? matched : allFiles).map((f) => f.id);

  return performSend(supabase, user, { recipients, subject, message, fileIds, quotationId: null });
}

/** 발송이력 삭제(2026-09-12) — admin만 삭제 버튼이 노출되지만(page.tsx), 실제
 * 권한 강제는 여기서가 아니라 DB RLS(0071, public.is_admin())가 한다 — 화면
 * 노출을 우회해 직접 호출해도 admin이 아니면 delete가 조용히 0행 처리된다. */
export async function deleteMaterialEmailLog(logId: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  await supabase.from("material_email_logs").delete().eq("id", logId);
  revalidatePath(PATH);
}

/** 발송 이력의 "보낸 메일 보기" 미리보기창(app/dashboard/material-email/page.tsx)이
 * 호출한다 — 이력에 저장된 제목·안내문·자료 목록·산출내역으로 실제 발송 때와 같은
 * buildMaterialEmailHtml을 다시 호출해 메일 본문 HTML을 재구성한다. 원문 HTML 자체를
 * 저장해두지 않아서 완전히 그 순간 그대로는 아니다 — 발신자 서명(이름·직함·핸드폰)과
 * 회사소개 자료 링크는 지금 시점 기준으로 다시 만들어지고, 문서/동영상 구분은
 * mimeType을 안 남겨서 파일명 확장자로 근사한다(2026-09-03). */
export async function getSentMaterialEmailHtml(logId: string): Promise<string | null> {
  const { supabase } = await requireAuthedClient();

  const log = await getMaterialEmailLogById(supabase, logId);
  if (!log) return null;

  const [{ data: senderProfile }, quotation, productLinks, baseUrl] = await Promise.all([
    supabase.from("profiles").select("name, title, phone").eq("id", log.senderId).maybeSingle(),
    log.quotationId ? getQuotation(supabase, log.quotationId) : Promise.resolve(null),
    resolveProductLinks().catch(() => []),
    resolveBaseUrl(),
  ]);

  const files = log.fileNames.map((name, i) => ({ name, link: log.fileLinks[i] ?? "#" }));
  const documents = files.filter((f) => !isVideoFileName(f.name));
  const videos = files.filter((f) => isVideoFileName(f.name));

  return buildMaterialEmailHtml({
    subject: log.subject,
    message: log.message,
    senderName: senderProfile?.name ?? log.senderEmail,
    senderTitle: senderProfile?.title ?? null,
    senderEmail: log.senderEmail,
    senderPhone: senderProfile?.phone ?? null,
    logoUrl: `${baseUrl}/material-email-banner.png`,
    documents,
    videos,
    quotation: quotation
      ? { quoteNumber: quotation.quoteNumber, customerName: quotation.customerName, printUrl: `${baseUrl}/quote/${quotation.id}` }
      : null,
    productLinks,
  });
}
