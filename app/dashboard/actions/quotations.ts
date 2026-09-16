"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { formatMember } from "@/lib/formatMember";
import { generateQuoteNumber, type QuotationItem } from "@/lib/queries/quotations";
import type { Database } from "@/lib/types/database.types";

const PATH = "/dashboard/quotations";

export type QuotationFormState = { error?: string } | undefined;

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

function numberOrZero(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

const EXECUTION_TYPES = ["직영", "컨소", "해당없음"] as const;

function executionType(formData: FormData): "직영" | "컨소" | "해당없음" {
  const raw = String(formData.get("executionType") ?? "");
  return (EXECUTION_TYPES as readonly string[]).includes(raw) ? (raw as (typeof EXECUTION_TYPES)[number]) : "직영";
}

function status(formData: FormData): "draft" | "final" {
  return String(formData.get("status") ?? "") === "final" ? "final" : "draft";
}

function parseItems(formData: FormData): { items: QuotationItem[]; error?: string } {
  const raw = String(formData.get("itemsJson") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { items: [], error: "품목 데이터를 읽지 못했습니다." };
  }
  if (!Array.isArray(parsed)) return { items: [], error: "품목 데이터 형식이 올바르지 않습니다." };

  // 금액은 클라이언트가 계산한 값을 그대로 믿지 않고 서버에서 다시 계산한다.
  const items: QuotationItem[] = parsed.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const quantity = Math.max(0, Number(row.quantity) || 0);
    const unitPrice = Math.max(0, Number(row.unitPrice) || 0);
    return {
      id: typeof row.id === "string" && row.id ? row.id : randomUUID(),
      productId: typeof row.productId === "string" && row.productId ? row.productId : null,
      name: String(row.name ?? "").trim(),
      specification: String(row.specification ?? "").trim(),
      unit: String(row.unit ?? "").trim(),
      quantity,
      unitPrice,
      amount: Math.round(quantity * unitPrice),
      note: String(row.note ?? "").trim(),
    };
  }).filter((item) => item.name);

  return { items };
}

// product_catalog.procurement_fee_rate는 퍼센트가 아니라 분수(0.0054 = 0.54%)로
// 저장된다 — app/dashboard/actions/productCatalog.ts의 자동 감지 로직이 그대로
// 심는 값(feeRate: 0.0054)과 같은 표현이라야 한다(사용자 확인, 2026-08-28 —
// 앞서 퍼센트로 착각해 100으로 한 번 더 나눠 수수료가 100배 작게 계산됐었음).
// rate가 비어 있는(0 이하) 조달 품목에는 이 기본값을 그대로 적용한다.
const DEFAULT_PROCUREMENT_FEE_RATE = 0.0054;

// 조달수수료율(product_catalog.procurement_fee_rate)이 걸린 품목만 골라 수수료를
// 계산한다(WHIZZUP 참고, 사용자 확인 2026-08-27) — 수수료는 부가세 계산과는 별개로
// 최종 합계에만 얹힌다(공급가액/부가세는 수수료를 뺀 품목금액 기준 그대로 유지).
async function computeProcurementFee(supabase: SupabaseClient<Database>, items: QuotationItem[]): Promise<number> {
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter((id): id is string => !!id)));
  if (productIds.length === 0) return 0;

  const { data } = await supabase
    .from("product_catalog")
    .select("id, procurement, procurement_fee_rate")
    .in("id", productIds);
  const feeRateById = new Map(
    (data ?? []).map((p) => {
      if (!p.procurement) return [p.id, 0];
      const rate = Number(p.procurement_fee_rate);
      return [p.id, rate > 0 ? rate : DEFAULT_PROCUREMENT_FEE_RATE];
    })
  );

  return Math.round(
    items.reduce((sum, item) => {
      const rate = (item.productId && feeRateById.get(item.productId)) || 0;
      return sum + item.amount * rate;
    }, 0)
  );
}

// 품목 단가는 부가세 별도가 아니라 부가세 포함가다(사용자 확인, 2026-08-27) —
// 품목금액 합계가 곧 최종 합계이고, 공급가액·부가세는 그 합계를 1.1로 나눠
// 거꾸로 계산한다(공급가액에 10%를 더해 합계를 구하는 것과 반대 방향). 조달수수료는
// 이 계산 밖에서 최종 합계에만 더해진다.
function computeTotals(items: QuotationItem[], discountAmount: number, extraAmount: number, procurementFeeAmount: number) {
  const subtotalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const adjustedAmount = Math.max(0, subtotalAmount - discountAmount + extraAmount);
  const supplyAmount = Math.round(adjustedAmount / 1.1);
  const taxAmount = adjustedAmount - supplyAmount;
  const totalAmount = adjustedAmount + procurementFeeAmount;
  return {
    subtotal_amount: subtotalAmount,
    supply_amount: supplyAmount,
    tax_amount: taxAmount,
    procurement_fee_amount: procurementFeeAmount,
    total_amount: totalAmount,
  };
}

export async function createQuotation(
  _prevState: QuotationFormState,
  formData: FormData
): Promise<QuotationFormState> {
  const { supabase, user } = await requireAuthedClient();

  const customerName = text(formData, "customerName");
  if (!customerName) return { error: "고객사/발주기관명을 입력하세요." };
  const quoteDate = text(formData, "quoteDate") ?? new Date().toISOString().slice(0, 10);

  const { items, error: itemsError } = parseItems(formData);
  if (itemsError) return { error: itemsError };
  if (items.length === 0) return { error: "품목을 하나 이상 추가하세요." };

  const discountAmount = numberOrZero(formData, "discountAmount");
  const extraAmount = numberOrZero(formData, "extraAmount");
  const procurementFeeAmount = await computeProcurementFee(supabase, items);
  const totals = computeTotals(items, discountAmount, extraAmount, procurementFeeAmount);

  const quoteNumber = await generateQuoteNumber(supabase, quoteDate);

  const { data: profile } = await supabase.from("profiles").select("name, email").eq("id", user.id).single();
  const actor = formatMember(profile?.name ?? null, null, profile?.email ?? user.email ?? "");

  const { data: quotation, error } = await supabase
    .from("quotations")
    .insert({
      quote_number: quoteNumber,
      customer_name: customerName,
      project_title: text(formData, "projectTitle"),
      business_project_id: text(formData, "businessProjectId"),
      quote_date: quoteDate,
      valid_until: text(formData, "validUntil"),
      manager_name: text(formData, "managerName"),
      items,
      discount_amount: discountAmount,
      extra_amount: extraAmount,
      ...totals,
      memo: text(formData, "memo"),
      include_stamp: formData.get("includeStamp") === "on",
      execution_type: executionType(formData),
      consortium_company: text(formData, "consortiumCompany"),
      consortium_rate: numberOrZero(formData, "consortiumRate"),
      extra_internal_cost: numberOrZero(formData, "extraInternalCost"),
      status: status(formData),
      created_by: user.id,
      created_by_name: actor,
    })
    .select("id")
    .single();

  if (error || !quotation) return { error: `저장 실패: ${error?.message ?? "알 수 없는 오류"}` };

  await supabase.from("notifications").insert({
    type: "quotation",
    title: `${quoteNumber} (${customerName})`,
    message: `${actor}님이 새 산출내역을 작성했습니다.`,
    // 알림을 누르면 목록이 아니라 이 산출내역의 상세 팝업이 바로 열리게
    // ?open=id를 붙인다(2026-09-16, 사용자 요청) — QuotationBoard.tsx가
    // 마운트 시 이 쿼리를 읽어 editingId를 채운다.
    link: `${PATH}?open=${quotation.id}`,
  });

  revalidatePath(PATH);
  revalidatePath("/dashboard/business2");
  return undefined;
}

export async function updateQuotation(
  _prevState: QuotationFormState,
  formData: FormData
): Promise<QuotationFormState> {
  const { supabase } = await requireAuthedClient();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "잘못된 요청입니다." };

  const customerName = text(formData, "customerName");
  if (!customerName) return { error: "고객사/발주기관명을 입력하세요." };
  const quoteDate = text(formData, "quoteDate") ?? new Date().toISOString().slice(0, 10);

  const { items, error: itemsError } = parseItems(formData);
  if (itemsError) return { error: itemsError };
  if (items.length === 0) return { error: "품목을 하나 이상 추가하세요." };

  const discountAmount = numberOrZero(formData, "discountAmount");
  const extraAmount = numberOrZero(formData, "extraAmount");
  const procurementFeeAmount = await computeProcurementFee(supabase, items);
  const totals = computeTotals(items, discountAmount, extraAmount, procurementFeeAmount);

  const { error } = await supabase
    .from("quotations")
    .update({
      customer_name: customerName,
      project_title: text(formData, "projectTitle"),
      business_project_id: text(formData, "businessProjectId"),
      quote_date: quoteDate,
      valid_until: text(formData, "validUntil"),
      manager_name: text(formData, "managerName"),
      items,
      discount_amount: discountAmount,
      extra_amount: extraAmount,
      ...totals,
      memo: text(formData, "memo"),
      include_stamp: formData.get("includeStamp") === "on",
      execution_type: executionType(formData),
      consortium_company: text(formData, "consortiumCompany"),
      consortium_rate: numberOrZero(formData, "consortiumRate"),
      extra_internal_cost: numberOrZero(formData, "extraInternalCost"),
      status: status(formData),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: `저장 실패: ${error.message}` };

  revalidatePath(PATH);
  revalidatePath("/dashboard/business2");
  return undefined;
}

export async function deleteQuotation(id: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  await supabase.from("quotations").delete().eq("id", id);
  revalidatePath(PATH);
  revalidatePath("/dashboard/business2");
}
