"use server";

import { revalidatePath } from "next/cache";
import { requireAuthedClient } from "@/lib/supabase/authed";
import type { TodoPriority } from "@/lib/queries/todos";

const PATH = "/dashboard/todos";

export type TodoFormState = { error?: string } | undefined;

function isValidPriority(value: string): value is TodoPriority {
  return value === "high" || value === "medium" || value === "low";
}

// alarm_at은 로컬 시간(초 없음)에서 그대로 오므로 브라우저의 로컬 시간대로
// 해석해 ISO(UTC)로 변환한다. 서버가 아니라 브라우저 로컬 표기를 신뢰하는
// 이유는 이 폼을 채우는 사람과 알림을 받을 사람이 항상 같은 사람(본인)이기
// 때문 — 다른 시간대 사용자를 대신 입력하는 경우가 없다.
function parseLocalDateTime(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// 알람을 date+time 두 개의 입력으로 나눠 받는다(2026-09-13) — 합친
// datetime-local 하나로는 Chrome에서도 step 속성이 네이티브 피커의 분 단위
// 제한에 반영되지 않는 한계가 있어(실측 확인), 독립된 time input(step이
// 정상 반영됨)으로 분리했다(components/dashboard/TodoBoard.tsx). 여기서 다시
// "YYYY-MM-DDTHH:mm" 형태로 합쳐 기존 parseLocalDateTime에 그대로 넘긴다.
function resolveAlarmAt(formData: FormData, dueDateRaw: string): { alarmAt: string | null; error?: string } {
  const alarmDateRaw = String(formData.get("alarmDate") ?? "").trim();
  const alarmTimeRaw = String(formData.get("alarmTime") ?? "").trim();

  if (!alarmDateRaw && !alarmTimeRaw) return { alarmAt: null };
  if (!alarmDateRaw) return { alarmAt: null, error: "알람 날짜를 입력하세요." };
  if (!alarmTimeRaw) return { alarmAt: null, error: "알람 시각을 입력하세요." };

  const alarmAt = parseLocalDateTime(`${alarmDateRaw}T${alarmTimeRaw}`);
  if (!alarmAt) return { alarmAt: null, error: "알람 시각이 올바르지 않습니다." };
  if (new Date(alarmAt).getTime() <= Date.now()) {
    return { alarmAt: null, error: "알람은 현재보다 이후 시각으로만 설정할 수 있습니다." };
  }
  if (dueDateRaw) {
    const due = new Date(`${dueDateRaw}T23:59:59`);
    if (new Date(alarmAt).getTime() > due.getTime()) {
      return { alarmAt: null, error: "알람 시각은 기한 이전이어야 합니다." };
    }
  }

  return { alarmAt };
}

export async function createTodo(_prevState: TodoFormState, formData: FormData): Promise<TodoFormState> {
  const { supabase, user } = await requireAuthedClient();

  const title = String(formData.get("title") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium");

  if (!title) return { error: "제목을 입력하세요." };
  if (!isValidPriority(priorityRaw)) return { error: "우선순위 값이 올바르지 않습니다." };

  const { alarmAt, error: alarmError } = resolveAlarmAt(formData, dueDateRaw);
  if (alarmError) return { error: alarmError };

  const { error } = await supabase.from("todos").insert({
    owner_id: user.id,
    title,
    due_date: dueDateRaw || null,
    priority: priorityRaw,
    alarm_at: alarmAt,
  });
  if (error) return { error: `저장 실패: ${error.message}` };

  revalidatePath(PATH);
  return undefined;
}

export async function updateTodo(todoId: string, _prevState: TodoFormState, formData: FormData): Promise<TodoFormState> {
  const { supabase, user } = await requireAuthedClient();

  const title = String(formData.get("title") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium");

  if (!title) return { error: "제목을 입력하세요." };
  if (!isValidPriority(priorityRaw)) return { error: "우선순위 값이 올바르지 않습니다." };

  const { alarmAt, error: alarmError } = resolveAlarmAt(formData, dueDateRaw);
  if (alarmError) return { error: alarmError };

  // 알람 시각이 바뀌면 이미 보낸 알람이라도 다시 보낼 수 있게 alarm_sent를
  // 초기화한다 — RLS가 owner_id = auth.uid()로 이미 본인 것만 걸러주므로
  // .eq("owner_id", ...)는 방어적 중복일 뿐 없어도 안전하지만, 실수로 다른
  // 행을 건드리는 걸 코드 레벨에서도 막기 위해 남겨둔다.
  const { error } = await supabase
    .from("todos")
    .update({
      title,
      due_date: dueDateRaw || null,
      priority: priorityRaw,
      alarm_at: alarmAt,
      alarm_sent: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", todoId)
    .eq("owner_id", user.id);
  if (error) return { error: `수정 실패: ${error.message}` };

  revalidatePath(PATH);
  return undefined;
}

export async function deleteTodo(todoId: string): Promise<void> {
  const { supabase, user } = await requireAuthedClient();
  await supabase.from("todos").delete().eq("id", todoId).eq("owner_id", user.id);
  revalidatePath(PATH);
}

export async function toggleTodoComplete(todoId: string, isCompleted: boolean): Promise<void> {
  const { supabase, user } = await requireAuthedClient();
  await supabase
    .from("todos")
    .update({
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", todoId)
    .eq("owner_id", user.id);
  revalidatePath(PATH);
}

