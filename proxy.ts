import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/set-password",
  "/auth/forgot-password",
  // 산출내역(견적) 고객 공유용 인쇄 페이지 — 자료메일발송으로 받은 링크를 로그인
  // 없이 열 수 있어야 한다(UUID를 아는 사람만 접근 가능, 사용자 확인 2026-08-28).
  "/quote",
  // Vercel Cron이 호출하는 API 라우트 — 세션 쿠키가 없는 서버-투-서버 호출이라
  // 여기서 막으면 안 되고, 라우트 자체의 CRON_SECRET 검증이 진짜 인증이다
  // (app/api/cron/ai-issues/route.ts, 2026-09-06).
  "/api/cron",
  // 사용자가 따로 만든 Claude 스킬/서비스가 AI Review에 자동으로 글을 올리는
  // 수신 엔드포인트 — 위와 같은 이유로 세션 체크를 건너뛴다(AI_REVIEW_INGEST_SECRET
  // 검증이 진짜 인증, app/api/ai-review/ingest/route.ts, 2026-09-06).
  "/api/ai-review/ingest",
  // 개인 API 토큰(Bearer)으로 인증하는 외부 캘린더 브리핑 API — 위와 같은 이유로
  // 세션 체크를 건너뛴다(라우트 자체의 토큰 검증이 진짜 인증,
  // app/api/calendar-feed/route.ts, 2026-09-13).
  "/api/calendar-feed",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function proxy(request: NextRequest) {
  // Supabase 미설정 상태(초기 세팅 전)에서는 그대로 통과시켜 /login에 안내 문구가 뜨게 한다.
  if (!isSupabaseConfigured) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);

  if (!user && !isPublic) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Server Action(예: 로그인 직후 recordLogin() 호출)은 현재 페이지 URL로 POST 요청을
  // 보낸다 — 로그인 폼이 /login에 있으므로 이 요청도 pathname === "/login"이 되어
  // 아래 리다이렉트 규칙에 잘못 걸린다(실측 확인, 2026-08-20: 로그인 직후 세션이 이미
  // 있는 상태에서 recordLogin()의 액션 요청이 대시보드로 리다이렉트되면서 "unexpected
  // response" 에러가 났음). Server Action 요청은 Next-Action 헤더로 식별해 제외한다.
  const isServerAction = request.headers.has("next-action");

  if (user && pathname === "/login" && !isServerAction) {
    return NextResponse.redirect(new URL("/dashboard/calendar", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // manifest.json/sw.js는 PWA "홈 화면에 추가"가 로그인 여부와 무관하게
    // 항상 읽을 수 있어야 해서 이미지 확장자와 같이 세션 체크를 건너뛴다
    // (2026-09-12, 이미지 확장자 제외 목록에 이미 있던 것과 같은 이유).
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
