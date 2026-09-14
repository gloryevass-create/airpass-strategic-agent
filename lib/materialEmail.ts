import "server-only";
import nodemailer from "nodemailer";
import {
  buildMaterialEmailHtml,
  type MaterialEmailFileLink,
  type MaterialEmailProductLink,
  type MaterialEmailQuotation,
} from "@/lib/materialEmailTemplate";

// Resend 같은 이메일 API 대신, 실제 회사 메일 계정(하이웍스 등)에 SMTP로 직접
// 로그인해서 그 계정 이름으로 보낸다 — 도메인 인증(DNS) 없이 바로 쓸 수 있다는
// 장점이 있지만, 이메일 API 키와 달리 "발송 전용" 권한 분리가 안 되고 실제
// 메일함 로그인 비밀번호를 그대로 쓴다는 차이가 있다(사용자 확인, 2026-08-23).
export const isMaterialEmailConfigured = Boolean(
  process.env.MATERIAL_EMAIL_SMTP_HOST &&
    process.env.MATERIAL_EMAIL_SMTP_PORT &&
    process.env.MATERIAL_EMAIL_SMTP_USER &&
    process.env.MATERIAL_EMAIL_SMTP_PASSWORD
);

export type MaterialEmailSmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromName: string | null;
};

// 개인 SMTP 계정 지원(2026-09-13) — 어떤 계정(공용 vs 본인)을 쓸지 고르는
// 판단은 호출부(app/dashboard/actions/materialEmail.ts::performSend)가 하고,
// 이 함수는 결정된 smtp 설정을 그대로 받아 발송만 한다(이 파일은 env를 직접
// 읽지 않음 — 공용 계정이 기본값이라는 사실도 호출부 책임).
export async function sendMaterialEmail(params: {
  to: string[];
  subject: string;
  message: string;
  senderName: string;
  senderTitle: string | null;
  senderEmail: string;
  senderPhone: string | null;
  logoUrl: string;
  documents: MaterialEmailFileLink[];
  videos: MaterialEmailFileLink[];
  quotation: MaterialEmailQuotation;
  productLinks: MaterialEmailProductLink[];
  /** 맺음말·하단 푸터 — 발송 폼에서 고칠 수 있다(2026-09-14). 안 넘기면 기본값. */
  closing?: string;
  signoff?: string;
  homepage?: string;
  youtube?: string;
  companyAddress?: string;
  smtp: MaterialEmailSmtpConfig;
}): Promise<void> {
  const { host, port, user, password, fromName } = params.smtp;

  const html = buildMaterialEmailHtml({
    subject: params.subject,
    message: params.message,
    senderName: params.senderName,
    senderTitle: params.senderTitle,
    senderEmail: params.senderEmail,
    senderPhone: params.senderPhone,
    logoUrl: params.logoUrl,
    documents: params.documents,
    videos: params.videos,
    quotation: params.quotation,
    productLinks: params.productLinks,
    closing: params.closing,
    signoff: params.signoff,
    homepage: params.homepage,
    youtube: params.youtube,
    companyAddress: params.companyAddress,
  });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });

  await transporter.sendMail({
    from: fromName ? { name: fromName, address: user } : user,
    to: params.to,
    subject: params.subject,
    html,
  });
}
