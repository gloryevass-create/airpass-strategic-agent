/** 리멤버 명함첩 CSV 파싱 — 브라우저(업로드 화면)와 서버(검증) 양쪽이 같은
 * 규칙을 쓰도록 한 곳에 모은다. 외부 의존성 없이 직접 파싱한다(프로젝트에 CSV
 * 라이브러리가 없고, 따옴표·쉼표·줄바꿈만 처리하면 되는 단순한 형식이라). */

/** 리멤버가 내보내는 헤더 13개(2026-10-11 실측). 순서가 아니라 이름으로 찾는다 —
 * 리멤버가 열 순서를 바꿔도 깨지지 않게. */
const HEADER_MAP: Record<string, keyof BusinessCardInput> = {
  "회사": "company",
  "이름": "name",
  "부서": "department",
  "직함": "title",
  "전자 메일 주소": "email",
  "근무지 주소 번지": "address",
  "근무처 전화": "workPhone",
  "근무처 팩스": "workFax",
  "휴대폰": "mobile",
  "명함 등록일": "registeredOn",
  "명함첩 이름": "cardBook",
  "그룹": "groupName",
  "메모": "memo",
};

/** 한 번의 서버 액션에 보내는 최대 명함 수. 브라우저가 CSV를 파싱해 이 크기로
 * 쪼개 보낸다 — 1,165건을 한 번에 JSON으로 보내면 Server Action 본문 상한
 * (next.config.ts의 4MB, 그 위에 Vercel 4.5MB)에 가까워진다.
 *
 * "use server" 파일은 async 함수만 export할 수 있어서 서버 액션 쪽이 아니라
 * 여기에 둔다(실측: 액션 파일에 두면 Turbopack 빌드가 거부한다). */
export const IMPORT_CHUNK_SIZE = 300;

export type BusinessCardInput = {
  company: string | null;
  name: string;
  department: string | null;
  title: string | null;
  email: string | null;
  address: string | null;
  workPhone: string | null;
  workFax: string | null;
  mobile: string | null;
  /** YYYY-MM-DD 또는 null */
  registeredOn: string | null;
  cardBook: string | null;
  groupName: string | null;
  memo: string | null;
  /** 같은 CSV를 다시 올려도 중복이 쌓이지 않게 하는 키 */
  dedupKey: string;
};

/** RFC4180 최소 구현 — 따옴표 안의 쉼표·줄바꿈과 `""` 이스케이프를 처리한다. */
export function parseCsv(text: string): string[][] {
  // 엑셀이 붙이는 BOM과 윈도 줄바꿈을 먼저 걷어낸다.
  const s = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }   // "" → 따옴표 한 개
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "2026년 10월 11일" → "2026-10-11". 형식이 다르면 null(저장은 그대로 진행). */
export function parseKoreanDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** 이름·회사·휴대폰으로 중복 판정 키를 만든다. 공백·하이픈을 걷어내고 소문자화해
 * "010-1234-5678"과 "01012345678"을 같게 본다. */
export function dedupKeyOf(name: string, company: string, mobile: string): string {
  const norm = (v: string) => v.replace(/[\s-]/g, "").toLowerCase();
  return `${norm(name)}|${norm(company)}|${norm(mobile)}`;
}

export type ParseResult = {
  cards: BusinessCardInput[];
  /** 파일 안에서 dedup_key가 겹쳐 합쳐진 건수 */
  mergedInFile: number;
  error?: string;
};

export function parseBusinessCardCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { cards: [], mergedInFile: 0, error: "내용이 없는 파일입니다." };
  }

  const header = rows[0].map((h) => h.trim());
  const index: Partial<Record<keyof BusinessCardInput, number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key) index[key] = i;
  });
  if (index.name === undefined) {
    return {
      cards: [],
      mergedInFile: 0,
      error: `"이름" 열을 찾지 못했습니다. 리멤버에서 내려받은 CSV가 맞는지 확인해 주세요(읽은 열: ${header.join(", ") || "없음"}).`,
    };
  }

  const at = (r: string[], key: keyof BusinessCardInput) => {
    const i = index[key];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  // 같은 키가 또 나오면 **뒤에 나온 행으로 덮어쓴다** — 리멤버는 최근 등록분이
  // 위에 오므로, 파일 안에서 겹치면 아래쪽(먼저 등록된 것)이 남는 게 아니라
  // 마지막으로 읽은 값이 남는다. 어느 쪽이든 1건만 남기는 게 목적이다.
  const byKey = new Map<string, BusinessCardInput>();
  for (const r of rows.slice(1)) {
    const name = at(r, "name");
    if (!name) continue;   // 이름 없는 행은 명함으로 볼 수 없다
    const company = at(r, "company");
    const mobile = at(r, "mobile");
    const blank = (v: string) => (v === "" ? null : v);
    byKey.set(dedupKeyOf(name, company, mobile), {
      company: blank(company),
      name,
      department: blank(at(r, "department")),
      title: blank(at(r, "title")),
      email: blank(at(r, "email")),
      address: blank(at(r, "address")),
      workPhone: blank(at(r, "workPhone")),
      workFax: blank(at(r, "workFax")),
      mobile: blank(mobile),
      registeredOn: parseKoreanDate(at(r, "registeredOn")),
      cardBook: blank(at(r, "cardBook")),
      groupName: blank(at(r, "groupName")),
      memo: blank(at(r, "memo")),
      dedupKey: dedupKeyOf(name, company, mobile),
    });
  }

  const cards = [...byKey.values()];
  const dataRows = rows.length - 1;
  return { cards, mergedInFile: Math.max(0, dataRows - cards.length) };
}
