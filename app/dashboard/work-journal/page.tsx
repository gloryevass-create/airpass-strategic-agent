import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getWorkJournalEntries } from "@/lib/queries/workJournal";
import { getTeamMemberNames } from "@/lib/queries/teamMembers";
import { IndustryWorkJournalBoard } from "@/components/dashboard/IndustryWorkJournalBoard";

export default async function WorkJournalPage() {
  const { supabase, user } = await requireAuthedClient();
  const [entries, members, profile] = await Promise.all([
    getWorkJournalEntries(supabase),
    getTeamMemberNames(supabase),
    supabase.from("profiles").select("name, role").eq("id", user.id).maybeSingle().then((r) => r.data),
  ]);

  // 수정·삭제는 작성자 본인과 관리자만 — 서버 액션과 RLS(0083)가 실제로 막고,
  // 여기서 넘기는 값은 눌러도 안 되는 버튼을 미리 감추기 위한 것이다.
  return (
    <IndustryWorkJournalBoard
      entries={entries}
      members={members}
      currentUserName={profile?.name ?? null}
      currentUserId={user.id}
      isAdmin={profile?.role === "admin"}
    />
  );
}
