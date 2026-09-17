import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { requireAuthedClient } from "@/lib/supabase/authed";

type Client = SupabaseClient<Database>;

export type ProductSupplyType = "partner" | "direct";

export type ProductCatalogItem = {
  id: string;
  name: string;
  specification: string | null;
  unitPrice: number | null;
  note: string | null;
  commissionRate: number | null;
  marginRate: number | null;
  supplyType: ProductSupplyType;
  reference: string | null;
  procurement: boolean;
  procurementChannel: string | null;
  procurementNumber: string | null;
  procurementFeeRate: number | null;
  needsReview: boolean;
  supplierVendorId: string | null;
  supplierVendorName: string | null;
  createdAt: string;
  isFavorite: boolean;
};

export async function getProductCatalog(supabase: Client): Promise<ProductCatalogItem[]> {
  // 즐겨찾기(본인 것만)를 읽으려고 사용자 id가 필요한데, 예전엔 여기서
  // supabase.auth.getUser()를 한 번 더 불렀다 — 이건 로컬 토큰 디코딩이 아니라
  // Supabase Auth 서버 왕복이라(실측 56~150ms), 이미 인증을 마친 페이지가
  // 부르는 함수에서 같은 검증을 또 기다리는 셈이었다(2026-09-17). 요청당 한 번만
  // 실제로 검증하는 requireAuthedClient()(React cache로 감쌈)를 쓰면 이 호출은
  // 같은 요청 안에서 이미 끝난 결과를 그대로 받는다.
  const { user } = await requireAuthedClient();

  const [{ data }, { data: vendors }, { data: favorites }, { data: userOrder }] = await Promise.all([
    supabase.from("product_catalog").select("*").order("name", { ascending: true }),
    supabase.from("partner_vendors").select("id, company_name"),
    supabase.from("product_catalog_favorites").select("product_id").eq("user_id", user.id),
    supabase.from("product_catalog_user_order").select("product_ids").eq("user_id", user.id).maybeSingle(),
  ]);

  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, v.company_name]));
  const favoriteIds = new Set((favorites ?? []).map((f) => f.product_id));

  const items = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    specification: p.specification,
    unitPrice: p.unit_price != null ? Number(p.unit_price) : null,
    note: p.note,
    commissionRate: p.commission_rate != null ? Number(p.commission_rate) : null,
    marginRate: p.margin_rate != null ? Number(p.margin_rate) : null,
    supplyType: p.supply_type,
    reference: p.reference,
    procurement: p.procurement,
    procurementChannel: p.procurement_channel,
    procurementNumber: p.procurement_number,
    procurementFeeRate: p.procurement_fee_rate != null ? Number(p.procurement_fee_rate) : null,
    needsReview: p.needs_review,
    supplierVendorId: p.supplier_vendor_id,
    supplierVendorName: p.supplier_vendor_id ? (vendorNameById.get(p.supplier_vendor_id) ?? null) : null,
    createdAt: p.created_at,
    isFavorite: favoriteIds.has(p.id),
  }));

  // 사용자가 화살표로 순서를 저장해뒀으면 그 순서를 우선 적용하고(모르는 id는 무시),
  // 아직 순서를 저장한 적 없는 제품(신규 추가분 등)은 이름순으로 뒤에 이어붙인다.
  const savedOrder = userOrder?.product_ids ?? [];
  let ordered = items;
  if (savedOrder.length > 0) {
    const itemById = new Map(items.map((it) => [it.id, it]));
    const result: ProductCatalogItem[] = [];
    for (const id of savedOrder) {
      const item = itemById.get(id);
      if (item) {
        result.push(item);
        itemById.delete(id);
      }
    }
    result.push(...itemById.values());
    ordered = result;
  }

  // 참고 저장소와 동일하게, 즐겨찾기한 제품은 항상 맨 위로 그룹핑해서 보여준다
  // (각 그룹 내부 순서는 위에서 정한 순서를 그대로 유지).
  return [...ordered.filter((p) => p.isFavorite), ...ordered.filter((p) => !p.isFavorite)];
}
