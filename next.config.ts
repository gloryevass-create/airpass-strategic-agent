import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Action 본문 상한. 기본값이 1MB라 첨부파일을 폼으로 보내는 화면
  // (Memo Board·SI Business/Cooperation/Marketing 히스토리·제조사 서류)에서
  // 사진 두 장만 골라도 조용히 실패하고 있었다 — 화면엔 "12MB 이하"라고
  // 적혀 있었는데 실제로 통한 적이 없었다(2026-09-29 확인).
  //
  // ⚠️ Vercel Functions의 요청 본문 상한 4.5MB는 플랜과 무관한 플랫폼 하드
  // 리밋이라 이 값을 그보다 크게 올려도 배포 환경에선 413으로 막힌다. 그래서
  // 여유를 둔 4MB로 잡는다(multipart 경계·헤더 오버헤드 몫). 그보다 큰 첨부가
  // 필요하면 Work Journal처럼 브라우저 → Supabase Storage 직접 업로드로
  // 바꿔야 한다(lib/workJournalUpload.ts 참고).
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // 2026-08-30 URL 경로 변경(events2→calendar, business3→business) 이전에 저장된
  // notifications.link 등 옛 경로를 가리키는 링크(알림 벨 딥링크, 북마크)가 깨지지
  // 않게 리다이렉트한다 — permanent: false로 둬서 브라우저가 과도하게 캐시하지
  // 않게 한다(나중에 필요하면 조정 가능하도록).
  async redirects() {
    return [
      { source: "/dashboard/events2", destination: "/dashboard/calendar", permanent: false },
      { source: "/dashboard/events2/:path*", destination: "/dashboard/calendar/:path*", permanent: false },
      { source: "/dashboard/business3", destination: "/dashboard/business", permanent: false },
      { source: "/dashboard/business3/:path*", destination: "/dashboard/business/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
