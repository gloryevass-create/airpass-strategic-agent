import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Client = SupabaseClient<Database>;

/** 담당자 선택 목록용 팀원 이름. 기존 담당자 필드들(사업/협업/마케팅업무/일정)이
 * 전부 "이름"만 자유 텍스트로 저장해온 값과 형식을 그대로 맞추기 위해(직함 없이)
 * 이름만 조회한다 — DB 스키마·기존 저장값은 바꾸지 않고 입력 방식만
 * 자유 입력에서 실제 팀원 목록 선택으로 바꾼다(사용자 확인, 2026-08-23).
 *
 * profiles 테이블을 직접 조회하지 않고 team_member_names() 함수(0080)를 쓴다 —
 * profiles의 select RLS가 "본인 행 또는 관리자만 전체"라서, 원래 이 쿼리를
 * profiles에 직접 날리면 member 권한 사용자는 자기 이름 하나만 돌려받아
 * 담당자 다중선택 목록에 본인만 보이는 버그가 있었다(사용자 신고, 2026-09-09).
 * 이 함수는 id/name 두 컬럼만 돌려주고 정의자 권한으로 실행돼 그 RLS를
 * 우회한다 — email/phone/google_email/last_login_ip 같은 민감 컬럼은 여전히
 * profiles 테이블 자체의 RLS로 보호된다.
 *
 * 2026-09-27 전까지는 같은 일을 하는 뷰였는데, Supabase Advisor가 그 패턴을
 * "Security Definer View" CRITICAL로 표시해 함수로 바꿨다(노출 범위는 동일).
 * 정렬은 함수 안에서 한다. */
export async function getTeamMemberNames(supabase: Client): Promise<string[]> {
  const { data } = await supabase.rpc("team_member_names");
  return Array.from(new Set((data ?? []).map((p) => p.name).filter((n): n is string => Boolean(n))));
}
