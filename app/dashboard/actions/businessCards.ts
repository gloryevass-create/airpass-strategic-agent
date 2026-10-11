"use server";

import { revalidatePath } from "next/cache";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { IMPORT_CHUNK_SIZE, type BusinessCardInput } from "@/lib/businessCardCsv";

const PATH = "/dashboard/account/business-cards";

export type ImportResult = { saved: number } | { error: string };

/** 업로드한 명함을 저장한다. 같은 사람을 다시 올리면 **덮어쓴다**(upsert) —
 * 리멤버에서 정보가 갱신된 명함을 다시 받아 올리는 게 자연스러운 사용법이고,
 * 재업로드할 때마다 건수가 불어나면 쓸 수 없는 명함첩이 된다.
 * 충돌 기준은 (owner_id, dedup_key) = 이름·회사·휴대폰(0086 참고). */
export async function importBusinessCards(cards: BusinessCardInput[]): Promise<ImportResult> {
  const { supabase, user } = await requireAuthedClient();

  if (!Array.isArray(cards) || cards.length === 0) return { saved: 0 };
  if (cards.length > IMPORT_CHUNK_SIZE) {
    return { error: `한 번에 ${IMPORT_CHUNK_SIZE}건까지만 보낼 수 있습니다.` };
  }

  const rows = cards
    .filter((c) => c && typeof c.name === "string" && c.name.trim() && typeof c.dedupKey === "string" && c.dedupKey)
    .map((c) => ({
      owner_id: user.id,
      company: c.company,
      name: c.name.trim(),
      department: c.department,
      title: c.title,
      email: c.email,
      address: c.address,
      work_phone: c.workPhone,
      work_fax: c.workFax,
      mobile: c.mobile,
      registered_on: c.registeredOn,
      card_book: c.cardBook,
      group_name: c.groupName,
      memo: c.memo,
      dedup_key: c.dedupKey,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return { saved: 0 };

  const { error } = await supabase
    .from("business_cards")
    .upsert(rows, { onConflict: "owner_id,dedup_key" });
  if (error) return { error: `저장 실패: ${error.message}` };

  revalidatePath(PATH);
  return { saved: rows.length };
}

export async function deleteBusinessCard(id: string): Promise<void> {
  const { supabase } = await requireAuthedClient();
  // RLS가 owner_id = auth.uid()만 허용하므로 남의 명함은 여기서 지워지지 않는다.
  await supabase.from("business_cards").delete().eq("id", id);
  revalidatePath(PATH);
}

/** 명함첩 비우기 — 다른 CSV로 통째로 갈아끼울 때 쓴다. 되돌릴 수 없으므로
 * 화면에서 두 번 확인한다. */
export async function deleteAllBusinessCards(): Promise<{ deleted: number }> {
  const { supabase, user } = await requireAuthedClient();
  const { data } = await supabase
    .from("business_cards")
    .delete()
    .eq("owner_id", user.id)
    .select("id");
  revalidatePath(PATH);
  return { deleted: data?.length ?? 0 };
}
