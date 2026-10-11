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

/** 한 번에 그리는 최대 건수. 실제 업로드분이 1,165건이라 전부 그리면 표가
 * 무거워진다 — 검색으로 좁혀 쓰는 화면이므로 상한을 두고 "몇 건 중 몇 건"을
 * 함께 보여준다. */
export const BUSINESS_CARD_PAGE_SIZE = 200;

export type BusinessCardList = {
  cards: BusinessCard[];
  /** 검색 조건에 맞는 전체 건수(상한과 무관) */
  matched: number;
  /** 내 명함첩 전체 건수 */
  total: number;
  groups: string[];
};

/** 명함첩은 완전 개인 데이터다(0086) — RLS가 owner_id = auth.uid()만 허용하므로
 * 여기서 따로 필터를 걸지 않아도 남의 명함은 조회되지 않는다. */
export async function getBusinessCards(
  supabase: Client,
  options: { search?: string; group?: string } = {}
): Promise<BusinessCardList> {
  const search = (options.search ?? "").trim();
  const group = (options.group ?? "").trim();

  let query = supabase
    .from("business_cards")
    .select(
      "id, company, name, department, title, email, address, work_phone, work_fax, mobile, registered_on, group_name, memo",
      { count: "exact" }
    );

  if (group) query = query.eq("group_name", group);
  if (search) {
    // 이름·회사·부서·직함·이메일·전화번호 어디든 걸리면 보여준다.
    // 쉼표는 or() 문법의 구분자라 들어오면 질의가 깨진다 — 미리 제거한다.
    const safe = search.replace(/[,()]/g, " ").trim();
    if (safe) {
      const like = `%${safe}%`;
      query = query.or(
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

  const [{ data, count }, { count: total }, { data: groupRows }] = await Promise.all([
    query.order("name", { ascending: true }).limit(BUSINESS_CARD_PAGE_SIZE),
    supabase.from("business_cards").select("id", { count: "exact", head: true }),
    // 그룹 목록 — 값이 있는 행만(실측 1,165건 중 119건) 모아 중복을 없앤다.
    supabase.from("business_cards").select("group_name").not("group_name", "is", null),
  ]);

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
    matched: count ?? 0,
    total: total ?? 0,
    groups: [...new Set((groupRows ?? []).map((g) => g.group_name).filter((g): g is string => Boolean(g)))].sort(),
  };
}
