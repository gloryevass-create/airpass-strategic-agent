// 자료메일발송 이메일 본문 HTML을 만드는 순수 함수 — 서버 전용 I/O(구글드라이브 API,
// SMTP)가 전혀 없어 클라이언트(미리보기)와 서버(실제 발송) 양쪽에서 그대로 재사용한다.
//
// 사용자가 Claude Design "Industry" 테마로 다시 그린 "메일 상세 화면" 템플릿을 이식했다
// (2026-08-30, 최초 이식은 2026-08-28였으나 그건 Industry 테마 적용 이전 버전이었다).
// 원본 소스(`메일 상세 화면.dc.html`)는 이 앱의 다른 화면들처럼 `.card`/`.blueprint`
// 클래스와 `var(--color-*)` CSS 변수·외부 스타일시트를 쓰는데, 이메일은 대부분의
// 메일 클라이언트(Gmail 등)가 `<head>`의 `<style>`/`<link>`를 제거하거나 CSS 변수를
// 지원하지 않아 인라인 스타일 + 리터럴 hex 값으로만 동작한다 — 그래서 클래스·변수를
// `components/industryTheme.css`에 정의된 실제 토큰 값으로 치환해서 옮겼다. "+" 모서리
// 등록 마크(`.blueprint > .corner`)는 `::before`/`::after` 가상 요소로 그려지는데
// 이메일에서 안정적으로 재현할 방법이 없어(가상 요소도 인라인 style로는 못 만듦)
// 이번 이식에서는 생략했다 — 각진 모서리 + 헤어라인 테두리만으로도 Industry 특유의
// 와이어프레임 룩은 충분히 남는다(사용자 확인 없이 내린 판단, 시각적으로 사소한 생략).
import { QUOTATION_SUPPLIER } from "@/lib/quotationCompany";
import {
  DEFAULT_MATERIAL_EMAIL_CLOSING,
  DEFAULT_MATERIAL_EMAIL_SIGNOFF,
  DEFAULT_MATERIAL_EMAIL_HOMEPAGE,
  DEFAULT_MATERIAL_EMAIL_YOUTUBE,
  DEFAULT_MATERIAL_EMAIL_ADDRESS,
} from "@/lib/materialEmailDefaults";

export type MaterialEmailFileLink = { name: string; link: string };
export type MaterialEmailProductLink = { label: string; link: string | null };
export type MaterialEmailQuotation = { quoteNumber: string; customerName: string; printUrl: string } | null;

// Industry 테마(components/industryTheme.css)의 실제 토큰 값 — 이메일은 var(--color-*)를
// 못 쓰므로 여기 리터럴 hex로 옮겨 둔다. 값이 바뀌면 이 파일도 같이 고쳐야 한다.
const COLOR = {
  bg: "#f5f5f7",
  text: "#1d1f20",
  divider: "#d4d4d7", // industryTheme.css의 --color-divider(반투명)를 흰 배경 위 근사 solid 값으로 변환
  accent: "#5980a6",
  accent100: "#eef6ff",
  accent300: "#b5d9fd",
  accent500: "#749dc4",
  accent700: "#416180",
  accent800: "#2c455d",
  accent900: "#1d2d3d",
  neutral600: "#7a7a7d",
  neutral700: "#5d5d60",
  neutral800: "#424244",
} as const;

const FONT_HEADING = "'Barlow Condensed',-apple-system,'Malgun Gothic',sans-serif";
const FONT_BODY = "'Barlow',-apple-system,'Malgun Gothic',sans-serif";

// 템플릿의 "문서자료" 항목 — 자료메일발송 폴더(구글드라이브)에서 이 키워드를 모두
// 포함하는 파일명을 찾아 연결한다(사용자 확인, 2026-08-28). 못 찾으면 그 항목은
// 이메일에서 빠진다(가짜 링크를 만들지 않음). 회사소개서는 맨 위에 고정 노출한다 —
// "아이핏" 키워드가 다른 파일과 잘못 매칭돼 엉뚱한 링크로 연결되는 문제가 있어 그
// 항목은 제거함(사용자 확인, 2026-08-28).
export const PRODUCT_MATERIAL_CATALOG: { label: string; keywords: string[] }[] = [
  { label: "에어패스 회사소개서", keywords: ["회사소개"] },
  { label: "에어패스 가상사격 시스템 브로셔", keywords: ["가상사격"] },
  { label: "마이베네핏 VM2 제품소개서", keywords: ["마이베네핏"] },
  { label: "올댓비전 스마트미러 제품소개서", keywords: ["올댓비전", "스마트미러"] },
  { label: "올댓비전 스마트PAPS 제품소개서", keywords: ["올댓비전", "스마트PAPS"] },
  { label: "올댓비전 스마트 테이블축구 제품소개서", keywords: ["올댓비전", "테이블축구"] },
  { label: "메타에듀시스 VR·충전보관함 브로셔", keywords: ["메타에듀시스"] },
];

// macOS(파인더)에서 올린 한글 파일명은 자모가 분리된 NFD로 저장되는 경우가 많아,
// 소스 코드의 NFC 문자열(예: "회사소개")과 바이트 단위로 달라 .includes()가 실패할
// 수 있다 — 양쪽 다 NFC로 정규화한 뒤 비교한다(사용자가 실제로 겪은 매칭 실패,
// 2026-08-28).
function normalize(text: string): string {
  return text.normalize("NFC").toLowerCase();
}

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".webm", ".mkv", ".wmv"];

/** 발송 이력(material_email_logs)은 파일 mimeType을 저장하지 않아(파일명·링크만
 * 남김) 실제 발송 당시 문서/동영상 분류를 파일명 확장자로 근사한다 — 이력 재구성
 * (메일 원문 다시보기, 2026-09-03) 전용이고, 실시간 발송/미리보기는 여전히
 * DriveMaterialFile.mimeType 기반 분류(MaterialEmailForm.tsx의 isVideoFile)를 쓴다. */
export function isVideoFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** PRODUCT_MATERIAL_CATALOG의 각 항목에 대해, 이름이 일치하는 파일의 id를 찾는다
 * (없으면 null — 호출부가 실제 링크 생성 여부를 판단). */
export function matchProductMaterialFiles<T extends { id: string; name: string }>(
  files: T[]
): { label: string; fileId: string | null }[] {
  return PRODUCT_MATERIAL_CATALOG.map(({ label, keywords }) => {
    const match = files.find((f) => keywords.every((k) => normalize(f.name).includes(normalize(k))));
    return { label, fileId: match ? match.id : null };
  });
}

// 맺음 인사는 마지막 줄(보내는 이름)만 굵게 — 기존 "감사합니다. / **주식회사
// 에어패스**" 모양을 그대로 유지하면서 여러 줄로 고칠 수 있게 한 규칙이다.
function signoffHtml(signoff: string): string {
  const lines = signoff.split("\n");
  const lastIndex = lines.reduce((acc, line, i) => (line.trim() ? i : acc), -1);
  return lines
    .map((line, i) => (i === lastIndex ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line)))
    .join("<br>");
}

// 푸터 입력란에는 "www.airpass.co.kr"처럼 스킴 없이 적는 게 자연스러워서, 링크로
// 만들 때만 http를 붙인다(이미 http(s)로 시작하면 그대로 둔다).
function withHttp(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

// 유튜브는 "@AIRPASS_XR" 핸들만 적는 걸 기본으로 보고 채널 URL로 바꾼다 —
// 전체 URL을 직접 붙여넣은 경우에는 그대로 쓴다.
function youtubeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.youtube.com/${value.startsWith("@") ? value : `@${value}`}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Industry .card 스타일(각진 모서리, 헤어라인 테두리, 흰 배경)을 그대로 링크 한 줄에
// 적용한다 — 원본은 색을 따로 안 주고 전역 a{color:accent-700} 규칙에 기대므로 여기도
// 같은 톤(accent700)을 명시로 준다.
function linkCard(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="display:block;border:1px solid ${COLOR.divider};background:#ffffff;padding:14px 18px;font-size:14px;font-weight:600;color:${COLOR.accent700};text-decoration:none;">${escapeHtml(label)} →</a>`;
}

function linkColumn(title: string, links: { label: string; href: string }[]): string {
  if (links.length === 0) return "";
  return `
        <div>
          <div style="font-family:${FONT_HEADING};font-size:12px;font-weight:600;color:${COLOR.neutral600};letter-spacing:0.04em;margin-bottom:10px;">${escapeHtml(title)}</div>
          <div style="display:flex;flex-direction:column;gap:8px;">${links.map((l) => linkCard(l.label, l.href)).join("")}</div>
        </div>
  `;
}

// 2026-08-30엔 산출내역이 없어도 이 섹션(제목·3개 안내 카드)을 항상 보여주고
// 견적서 하이라이트 박스만 "견적내용이 없습니다."로 바꿨는데, 빈 박스가 오히려
// 어색하다는 피드백으로 2026-09-03 다시 원래대로 되돌렸다 — 산출내역을 첨부하지
// 않으면 섹션 전체(3개 카드 포함)가 통째로 빠진다.
function quotationSectionHtml(quotation: MaterialEmailQuotation): string {
  if (!quotation) return "";

  return `
      <h2 style="font-family:${FONT_HEADING};font-weight:600;font-size:22px;color:${COLOR.text};margin:0 0 6px;">견적 및 제품자료 안내</h2>
      <div style="width:36px;height:3px;background:${COLOR.accent};margin-bottom:18px;"></div>

      <div style="border:1px solid ${COLOR.divider};background:#ffffff;padding:18px 22px;margin-bottom:28px;">
        <div style="font-size:15px;font-weight:600;color:${COLOR.text};margin-bottom:10px;">견적서 원본 PDF 열람 · 다운로드</div>
        <a href="${escapeHtml(quotation.printUrl)}" style="display:inline-block;background:${COLOR.accent};color:#ffffff;border-radius:0;padding:10px 18px;font-size:13.5px;font-weight:600;font-family:${FONT_HEADING};text-decoration:none;">${escapeHtml(quotation.quoteNumber)} 견적서 보기 →</a>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:44px;">
        <div style="border:1px solid ${COLOR.accent300};background:${COLOR.accent300};padding:20px;">
          <div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:${COLOR.accent900};margin-bottom:10px;">01</div>
          <div style="font-size:15px;font-weight:600;color:${COLOR.accent900};margin-bottom:8px;">제품자료 제공</div>
          <div style="font-size:12.5px;color:${COLOR.accent800};line-height:1.6;">에어패스·올댓비전<br>메타에듀시스 등</div>
        </div>
        <div style="border:1px solid ${COLOR.accent500};background:${COLOR.accent500};padding:20px;">
          <div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:#ffffff;margin-bottom:10px;">02</div>
          <div style="font-size:15px;font-weight:600;color:#ffffff;margin-bottom:8px;">구성 검토 지원</div>
          <div style="font-size:12.5px;color:${COLOR.accent100};line-height:1.6;">예산·공간 여건에 맞는<br>품목 조정 및 제안</div>
        </div>
        <div style="border:1px solid ${COLOR.accent800};background:${COLOR.accent800};padding:20px;">
          <div style="font-family:${FONT_HEADING};font-size:14px;font-weight:600;color:#ffffff;margin-bottom:10px;">03</div>
          <div style="font-size:15px;font-weight:600;color:#ffffff;margin-bottom:8px;">구축 이후 지원</div>
          <div style="font-size:12.5px;color:${COLOR.accent100};line-height:1.6;">설치·교육·유지보수<br>연계 지원</div>
        </div>
      </div>
  `;
}

// 원본 템플릿에는 이 제목·설명이 고정으로 있다 — 매칭된 링크가 하나도 없어도
// (자료 폴더 파일명이 아직 카탈로그와 안 맞을 때) 제목 자체는 그대로 보이게 한다
// (사용자 확인, 2026-08-28 — 매칭 실패로 제목까지 통째로 사라졌던 문제). Industry
// 개편판은 이 섹션을 "문서자료"/"동영상자료" 2단으로 나눈다 — 문서자료는 고정
// 카탈로그(PRODUCT_MATERIAL_CATALOG) 매칭 링크 + 실제 첨부한 문서를 합치고,
// 동영상자료는 실제 첨부한 영상만 담는다(2026-08-30, 예전엔 "첨부 문서/영상"이
// 이 섹션 아래에 이모지 제목으로 별도 노출됐는데 새 디자인엔 그 자리가 없어 통합).
function productLinksSectionHtml(
  productLinks: MaterialEmailProductLink[],
  documents: MaterialEmailFileLink[],
  videos: MaterialEmailFileLink[]
): string {
  const matched = productLinks.filter((p): p is { label: string; link: string } => p.link != null);
  const docLinks = [...matched.map((p) => ({ label: p.label, href: p.link })), ...documents.map((d) => ({ label: d.name, href: d.link }))];
  const videoLinks = videos.map((v) => ({ label: v.name, href: v.link }));

  return `
      <h2 style="font-family:${FONT_HEADING};font-weight:600;font-size:22px;color:${COLOR.text};margin:0 0 6px;">회사 및 제품소개 자료</h2>
      <div style="width:36px;height:3px;background:${COLOR.accent};margin-bottom:14px;"></div>
      <p style="font-size:14px;color:${COLOR.neutral700};line-height:1.7;margin:0 0 18px;">
        아래 항목을 선택하시면 공용 자료 폴더에서 바로 확인하거나 다운로드하실 수 있습니다.
      </p>
      <div style="display:flex;gap:24px;margin-bottom:40px;flex-wrap:wrap;">
        ${linkColumn("문서자료", docLinks)}
        ${linkColumn("동영상자료", videoLinks)}
      </div>
  `;
}

export function buildMaterialEmailHtml(params: {
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
  /** 맺음말·하단 푸터 — 발송 폼에서 직접 고칠 수 있다(2026-09-14). 값을 안
   * 넘기면 기존과 같은 기본값(lib/materialEmailDefaults.ts)을 쓴다. */
  closing?: string;
  signoff?: string;
  homepage?: string;
  youtube?: string;
  companyAddress?: string;
}): string {
  const { subject, message, senderName, senderTitle, senderEmail, senderPhone, logoUrl, documents, videos, quotation, productLinks } =
    params;
  const closing = (params.closing ?? DEFAULT_MATERIAL_EMAIL_CLOSING).trim();
  const signoff = (params.signoff ?? DEFAULT_MATERIAL_EMAIL_SIGNOFF).trim();
  const homepage = (params.homepage ?? DEFAULT_MATERIAL_EMAIL_HOMEPAGE).trim();
  const youtube = (params.youtube ?? DEFAULT_MATERIAL_EMAIL_YOUTUBE).trim();
  const companyAddress = (params.companyAddress ?? DEFAULT_MATERIAL_EMAIL_ADDRESS).trim();

  const senderLine = senderTitle ? `${escapeHtml(senderName)} ${escapeHtml(senderTitle)}` : escapeHtml(senderName);
  // 개인 핸드폰번호(profiles.phone)가 등록돼 있을 때만 M. 줄을 보여준다 — 회사
  // 대표번호(T.)는 QUOTATION_SUPPLIER 고정값 그대로 항상 표시한다.
  const phoneLine = senderPhone ? `M. ${escapeHtml(senderPhone)} · ` : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:${COLOR.bg};font-family:${FONT_BODY};color:${COLOR.text};">
  <div style="width:100%;max-width:900px;margin:0 auto;padding:32px 24px 80px;box-sizing:border-box;">
    <div style="border:1px solid ${COLOR.divider};background:#ffffff;">

      <div style="line-height:0;">
        <img src="${escapeHtml(logoUrl)}" alt="airpass" width="852" style="width:100%;max-width:852px;height:auto;display:block;" />
      </div>

      <div style="padding:0 40px;border-top:1px solid ${COLOR.divider};">
        <div style="font-family:${FONT_HEADING};font-weight:600;font-size:19px;color:${COLOR.text};padding:20px 0;">${escapeHtml(subject)}</div>
      </div>

      <div style="padding:8px 40px 44px;">

        <p style="font-size:15px;color:${COLOR.text};line-height:1.7;margin:28px 0 32px;white-space:pre-wrap;">${escapeHtml(message)}</p>

        <div style="border:1px solid ${COLOR.divider};background:#ffffff;padding:22px 24px;margin-bottom:36px;">
          <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${COLOR.accent};margin-bottom:6px;">ABOUT AIRPASS</div>
          <div style="font-family:${FONT_HEADING};font-weight:600;font-size:17px;color:${COLOR.text};margin-bottom:10px;">SI컨설팅, 디지털스포츠, 공간재구조화 등 학교와 공공기관들이 디지털, AI 환경 구축을 종합적으로 컨설팅 해드립니다.</div>
          <p style="margin:0;font-size:13px;color:${COLOR.text};opacity:0.8;">저희 주식회사 에어패스는 학교와 공공기관의 교육·체육 공간 구축을 지원하고 있습니다.</p>
        </div>

        ${quotationSectionHtml(quotation)}
        ${productLinksSectionHtml(productLinks, documents, videos)}

        ${
          closing
            ? `<p style="font-size:14.5px;color:${COLOR.neutral800};line-height:1.8;margin:0 0 20px;">
          ${escapeHtml(closing).replace(/\n/g, "<br>")}
        </p>`
            : ""
        }
        ${
          signoff
            ? `<p style="font-size:14.5px;color:${COLOR.text};line-height:1.8;margin:0 0 30px;">
          ${signoffHtml(signoff)}
        </p>`
            : ""
        }

        <div style="border:1px solid ${COLOR.divider};background:#ffffff;padding:20px 24px;margin-bottom:16px;">
          <div style="font-size:15px;font-weight:600;color:${COLOR.text};margin-bottom:8px;">${senderLine}</div>
          <div style="font-size:13.5px;color:${COLOR.neutral700};line-height:1.7;">
            ${phoneLine}T. ${escapeHtml(QUOTATION_SUPPLIER.phone)}<br>
            E. ${escapeHtml(senderEmail)}
          </div>
        </div>

        ${
          homepage || youtube
            ? `<div style="display:flex;gap:16px;margin-bottom:8px;font-size:13.5px;font-weight:600;">
          ${homepage ? `<a href="${escapeHtml(withHttp(homepage))}" style="color:${COLOR.accent700};text-decoration:none;">홈페이지 : ${escapeHtml(homepage)}</a>` : ""}
          ${youtube ? `<a href="${escapeHtml(youtubeUrl(youtube))}" style="color:${COLOR.accent700};text-decoration:none;">유튜브 : ${escapeHtml(youtube)}</a>` : ""}
        </div>`
            : ""
        }
        ${
          companyAddress
            ? `<div style="margin-bottom:16px;font-size:13px;color:${COLOR.neutral700};">회사주소 : ${escapeHtml(companyAddress)}</div>`
            : ""
        }

        <div style="border-top:1px solid ${COLOR.divider};padding-top:16px;font-size:12.5px;color:${COLOR.neutral600};">*당사에 보내주신 관심에 깊이 감사드립니다.</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
