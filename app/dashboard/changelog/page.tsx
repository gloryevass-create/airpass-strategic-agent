import { requireAuthedClient } from "@/lib/supabase/authed";
import { CHANGELOG } from "@/lib/changelog";
import { NavIcon } from "@/components/icons/NavIcon";
import { ChangelogList } from "@/components/dashboard/ChangelogList";

export default async function ChangelogPage() {
  await requireAuthedClient();

  return (
    <main className="flex w-full flex-col gap-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-primary">
          <NavIcon name="history" className="h-5 w-5" />
          업데이트 히스토리
        </h1>
        <p className="mt-1 text-sm text-ink-mute">
          이 대시보드가 하루하루 어떤 기능을 개발·변경했는지 기록합니다(수집 데이터 갱신
          이력이 아니라 개발 작업 이력입니다).
        </p>
      </div>

      <ChangelogList entries={CHANGELOG} />
    </main>
  );
}
