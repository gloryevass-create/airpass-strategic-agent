import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getAiTools } from "@/lib/queries/aiTools";
import { AiToolsBoard } from "@/components/dashboard/AiToolsBoard";

export default async function AiToolsPage() {
  const { supabase, user } = await requireAuthedClient();
  const [tools, profile] = await Promise.all([
    getAiTools(supabase),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle().then((r) => r.data),
  ]);

  return <AiToolsBoard tools={tools} currentUserId={user.id} isAdmin={profile?.role === "admin"} />;
}
