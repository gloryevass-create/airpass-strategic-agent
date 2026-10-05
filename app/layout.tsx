import type { Metadata, Viewport } from "next";
import "./globals.css";

// 모바일에서 "홈 화면에 추가"로 열면 브라우저 주소창 없이 앱처럼 전체화면으로
// 뜨게 하는 PWA 최소 설정(2026-09-12) — 일반 브라우저 탭으로 그냥 들어오는
// 경우는 주소창을 없앨 방법이 없어(브라우저 자체 UI), "홈 화면에 추가"를
// 한 번 거쳐야만 적용된다(사용자 확인). manifest.json은 public/manifest.json.
export const metadata: Metadata = {
  title: "Strategic Agent",
  description: "에어패스 네이버 키워드광고·블로그 경쟁사 모니터링 대시보드",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Strategic Agent",
  },
  // 아이콘 파일을 교체해도 브라우저·iOS가 예전 것을 오래 캐시하므로 URL에 버전을
  // 붙여 새로 받게 한다(2026-10-06 아이콘 교체). 이미 홈 화면에 추가해 둔 바로가기는
  // 이걸로도 안 바뀌어서, 삭제하고 다시 추가해야 새 아이콘이 적용된다.
  icons: {
    apple: "/apple-touch-icon.png?v=2",
  },
};

export const viewport: Viewport = {
  themeColor: "#262b3a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
