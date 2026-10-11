import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Client = SupabaseClient<Database>;

export type BusinessCard = {
  id: string;
  company: string | null;
  name: string;
  department: string | null;
  title: string | null;
  email: string | null;
  address: string | null;
  workPhone: string | null;
  workFax: string | null;
  mobile: string | null;
  registeredOn: string | null;
  groupName: string | null;
  memo: string | null;
};

/** 리멤버 웹과 같은 50건 단위 페이징(사용자 요청, 2026-10-12). */
export const BUSINESS_CARD_PAGE_SIZE = 50;

/** 그룹이 비어 있는 명함을 가리키는 값. 리멤버의 "미분류 명함"과 같은 개념이라
 * 실제 그룹 이름과 섞이지 않도록 일반 값으로 쓸 수 없는 문자열을 쓴다. */
export const UNGROUPED = "__ungrouped__";

export type BusinessCardSort = "registered" | "name";

export type BusinessCardGroupCount = { name: string; count: number };

export type BusinessCardList = {
  cards: BusinessCard[];
  /** 검색·그룹 조건에 맞는 전체 건수(페이지와 무관) */
  matched: number;
  /** 내 명함첩 전체 건수 */
  total: number;
  /** 왼쪽 그룹 목록 — 리멤버처럼 건수를 함께 보여준다 */
  groups: BusinessCardGroupCount[];
  ungrouped: number;
  page: number;
  pageCount: number;
};

/** 명함첩은 완전 개인 데이터다(0086) — RLS가 owner_id = auth.uid()만 허용하므로
 * 여기서 따로 필터를 걸지 않아도 남의 명함은 조회되지 않는다. */
export async function getBusinessCards(
  supabase: Client,
  options: { search?: string; group?: string; page?: number; sort?: BusinessCardSort } = {}
): Promise<BusinessCardList> {
  const search = (options.search ?? "").trim();
  const group = (options.group ?? "").trim();
  const sort: BusinessCardSort = options.sort === "name" ? "name" : "registered";
  const page = Math.max(1, Math.floor(options.page ?? 1));

  const base = () => {
    let q = supabase
      .from("business_cards")
      .select(
        "id, company, name, department, title, email, address, work_phone, work_fax, mobile, registered_on, group_name, memo",
        { count: "exact" }
      );
    if (group === UNGROUPED) q = q.is("group_name", null);
    else if (group) q = q.eq("group_name", group);
    if (search) {
      // 쉼표·괄호는 or() 문법의 구분자라 들어오면 질의가 깨진다 — 미리 없앤다.
      const safe = search.replace(/[,()]/g, " ").trim();
      if (safe) {
        const like = `%${safe}%`;
        q = q.or(
          [
            `name.ilike.${like}`,
            `company.ilike.${like}`,
            `department.ilike.${like}`,
            `title.ilike.${like}`,
            `email.ilike.${like}`,
            `mobile.ilike.${like}`,
            `work_phone.ilike.${like}`,
          ].join(",")
        );
      }
    }
    return q;
  };

  const from = (page - 1) * BUSINESS_CARD_PAGE_SIZE;
  const ordered =
    sort === "name"
      ? base().order("name", { ascending: true })
      : // 등록일 순 — 같은 날짜 안에서는 이름순으로 묶여 보이게 한다.
        base().order("registered_on", { ascending: false, nullsFirst: false }).order("name", { ascending: true });

  const [{ data, count }, { count: total }, groupRows] = await Promise.all([
    ordered.range(from, from + BUSINESS_CARD_PAGE_SIZE - 1),
    supabase.from("business_cards").select("id", { count: "exact", head: true }),
    // 그룹별 건수 — PostgREST로 group by를 할 수 없어 group_name 한 칸만 전부
    // 받아 JS에서 센다(1,165행 × 한 칸이라 가볍다). 페이지네이션 상한(1,000행)에
    // 걸리지 않게 나눠 받는다.
    fetchAllGroupNames(supabase),
  ]);

  const counts = new Map<string, number>();
  let ungrouped = 0;
  for (const g of groupRows) {
    if (!g) ungrouped += 1;
    else counts.set(g, (counts.get(g) ?? 0) + 1);
  }

  const matched = count ?? 0;
  return {
    cards: (data ?? []).map((c) => ({
      id: c.id,
      company: c.company,
      name: c.name,
      department: c.department,
      title: c.title,
      email: c.email,
      address: c.address,
      workPhone: c.work_phone,
      workFax: c.work_fax,
      mobile: c.mobile,
      registeredOn: c.registered_on,
      groupName: c.group_name,
      memo: c.memo,
    })),
    matched,
    total: total ?? 0,
    groups: [...counts.entries()].map(([name, n]) => ({ name, count: n })).sort((a, b) => a.name.localeCompare(b.name, "ko")),
    ungrouped,
    page,
    pageCount: Math.max(1, Math.ceil(matched / BUSINESS_CARD_PAGE_SIZE)),
  };
}

/** PostgREST는 한 번에 1,000행까지만 주므로 나눠 받는다. */
async function fetchAllGroupNames(supabase: Client): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("business_cards")
      .select("group_name")
      .range(from, from + 999);
    if (!data?.length) break;
    out.push(...data.map((r) => r.group_name));
    if (data.length < 1000) break;
  }
  return out;
}
