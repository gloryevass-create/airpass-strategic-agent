import "@/components/industryTheme.css";
import { requireAuthedClient } from "@/lib/supabase/authed";
import { getChannelStats, getYoutubeVideos } from "@/lib/queries/youtube";
import { YoutubeChannelStats } from "@/components/dashboard/YoutubeChannelStats";
import { YoutubeVideoTable } from "@/components/dashboard/YoutubeVideoTable";
import { MonitorDateRangeFilter } from "@/components/dashboard/MonitorDateRangeFilter";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function YoutubePage({ searchParams }: { searchParams: SearchParams }) {
  const { from, to } = await searchParams;
  await requireAuthedClient();
  const [channelStats, videos] = await Promise.all([
    getChannelStats({ since: from, until: to }),
    getYoutubeVideos(),
  ]);

  return (
    <div className="industry-theme" style={{ minHeight: "100vh", background: "#ffffff" }}>
      <div className="marketing-page-content" style={{ padding: "var(--space-8) var(--space-6)", maxWidth: 1400, margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="3" />
          <path d="m10 9 5 3-5 3z" fill="var(--color-accent)" stroke="none" />
        </svg>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 22, margin: 0, color: "var(--color-accent-700)" }}>유튜브채널분석</h1>
      </div>
      <p className="text-muted" style={{ margin: "var(--space-2) 0 var(--space-6)", fontSize: 13 }}>
        에어패스 공식 유튜브 채널(
        <a href="https://www.youtube.com/@AIRPASS_XR" target="_blank" rel="noopener noreferrer">
          @AIRPASS_XR
        </a>
        ) 운영 현황 — 구독자·조회수 성장 추이와 영상별 성과를 모읍니다(YouTube Data API v3 공식
        기반).
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <MonitorDateRangeFilter basePath="/dashboard/youtube" range={channelStats.range} resultCount={channelStats.trend.length} />
        <YoutubeChannelStats data={channelStats} />

        <section>
          <h2 style={{ margin: "0 0 var(--space-3)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }} className="text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            영상별 성과
          </h2>
          <YoutubeVideoTable videos={videos} />
        </section>
      </div>
      </div>
    </div>
  );
}
