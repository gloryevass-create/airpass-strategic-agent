import type { SVGProps } from "react";

// 서버/클라이언트 컴포넌트 어디서든 그대로 쓸 수 있도록 훅 없이 순수 렌더 함수로 둔다
// (사이드바 메뉴 아이콘과 각 페이지 제목 아이콘이 이 파일을 함께 쓴다).
export type IconName =
  | "sunrise"
  | "search"
  | "document"
  | "clipboard"
  | "newspaper"
  | "megaphone"
  | "play"
  | "chart"
  | "list"
  | "alert"
  | "pie"
  | "calendar"
  | "tag"
  | "paperclip"
  | "chat"
  | "sparkle"
  | "wallet"
  | "shield"
  | "logout"
  | "eye"
  | "eyeOff"
  | "key"
  | "user"
  | "briefcase"
  | "link"
  | "share"
  | "chevron"
  | "bell"
  | "menu"
  | "history"
  | "receipt"
  | "checkSquare";

export function NavIcon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const shared = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "search":
      return (
        <svg {...shared} {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case "document":
      return (
        <svg {...shared} {...props}>
          <path d="M7 3h6l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M13 3v5h5" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...shared} {...props}>
          <rect x="6" y="4" width="12" height="17" rx="2" />
          <path d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
          <path d="M9 11h6M9 15h6" />
        </svg>
      );
    case "newspaper":
      return (
        <svg {...shared} {...props}>
          <rect x="3" y="5" width="13" height="15" rx="1" />
          <path d="M16 8h3.5a.5.5 0 0 1 .5.5V18a2 2 0 0 1-2 2H6" />
          <path d="M6.5 9h6M6.5 12h6M6.5 15h4" />
        </svg>
      );
    case "megaphone":
      return (
        <svg {...shared} {...props}>
          <path d="M3 10.5v3a1 1 0 0 0 1 1h1.8L10 19v-13l-4.2 4.5H4a1 1 0 0 0-1 1z" />
          <path d="M14 9a4 4 0 0 1 0 6" />
          <path d="M17 6.5a8 8 0 0 1 0 11" />
        </svg>
      );
    case "play":
      return (
        <svg {...shared} {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5l6 3.5-6 3.5v-7z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "chart":
      return (
        <svg {...shared} {...props}>
          <path d="M3 20h18" />
          <path d="M4 16l5-5 4 4 7-8" />
          <path d="M15 7h5v5" />
        </svg>
      );
    case "list":
      return (
        <svg {...shared} {...props}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>
      );
    case "alert":
      return (
        <svg {...shared} {...props}>
          <path d="M10.4 3.9L2.9 17.5a1.3 1.3 0 0 0 1.1 2h16a1.3 1.3 0 0 0 1.1-2L13.6 3.9a1.3 1.3 0 0 0-2.2 0z" />
          <path d="M12 10v3.5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "pie":
      return (
        <svg {...shared} {...props}>
          <path d="M21 12A9 9 0 1 1 12 3v9h9z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...shared} {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9.5h18" />
          <path d="M8 3v4M16 3v4" />
        </svg>
      );
    case "tag":
      return (
        <svg {...shared} {...props}>
          <path d="M20.4 12.6L12 21a1.3 1.3 0 0 1-1.9 0l-6.9-6.9a1.3 1.3 0 0 1 0-1.9L11.6 3.6a1.3 1.3 0 0 1 .9-.4H19a1.3 1.3 0 0 1 1.3 1.3v6.5a1.3 1.3 0 0 1-.4.9z" />
          <circle cx="15.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "paperclip":
      return (
        <svg {...shared} {...props}>
          <path d="M14.5 6.5L7.9 13a2.5 2.5 0 0 0 3.5 3.5l7-7a4.2 4.2 0 0 0-6-6l-7 7a6 6 0 0 0 8.5 8.5" />
        </svg>
      );
    case "chat":
      return (
        <svg {...shared} {...props}>
          <path d="M20.5 11.5a8 8 0 0 1-8 8 8.4 8.4 0 0 1-3.6-.8L4 20l1.3-4.5a8 8 0 0 1-.8-3.5 8 8 0 0 1 8-8h.5a8 8 0 0 1 7.5 7.5z" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...shared} {...props}>
          <path d="M12 3l1.6 4.9L18.5 9l-4.9 1.6L12 15.5l-1.6-4.9L5.5 9l4.9-1.6L12 3z" />
          <path d="M19 15.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...shared} {...props}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1" />
          <path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a1 1 0 0 0 1-1v-3.5" />
          <rect x="14" y="10.5" width="6.5" height="5" rx="1" />
          <circle cx="16.7" cy="13" r=".6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "shield":
      return (
        <svg {...shared} {...props}>
          <path d="M12 3l7 3v5.5c0 4.5-3 7.7-7 9.5-4-1.8-7-5-7-9.5V6z" />
          <path d="M9 12l2 2 4-4.5" />
        </svg>
      );
    case "logout":
      return (
        <svg {...shared} {...props}>
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 8l-4 4 4 4" />
          <path d="M6 12h12" />
        </svg>
      );
    case "eye":
      return (
        <svg {...shared} {...props}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eyeOff":
      return (
        <svg {...shared} {...props}>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.6A10.6 10.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.4 4.2M6.6 6.9C4.1 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.9-.8" />
          <path d="M9.5 12a2.5 2.5 0 0 0 3.6 2.2" />
        </svg>
      );
    case "key":
      return (
        <svg {...shared} {...props}>
          <circle cx="7.5" cy="15.5" r="4.5" />
          <path d="M10.8 12.2L20 3" />
          <path d="M16 7l3 3M13 10l2.5 2.5" />
        </svg>
      );
    case "user":
      return (
        <svg {...shared} {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...shared} {...props}>
          <rect x="3" y="7.5" width="18" height="12" rx="2" />
          <path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
          <path d="M3 12h18" />
        </svg>
      );
    case "link":
      return (
        <svg {...shared} {...props}>
          <path d="M9.5 14.5l5-5" />
          <path d="M13 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
          <path d="M11 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
        </svg>
      );
    case "share":
      return (
        <svg {...shared} {...props}>
          <circle cx="18" cy="5.5" r="2.3" />
          <circle cx="6" cy="12" r="2.3" />
          <circle cx="18" cy="18.5" r="2.3" />
          <path d="M8 10.8l8-4.2M8 13.2l8 4.2" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...shared} {...props}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "bell":
      return (
        <svg {...shared} {...props}>
          <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 3h16z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
      );
    case "menu":
      return (
        <svg {...shared} {...props}>
          <path d="M4 6.5h16M4 12h16M4 17.5h16" />
        </svg>
      );
    case "history":
      return (
        <svg {...shared} {...props}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v4h4" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...shared} {...props}>
          <path d="M6 3h12v17.5l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 20.5z" />
          <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
        </svg>
      );
    case "checkSquare":
      return (
        <svg {...shared} {...props}>
          <path d="m9 11 3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    // Today Issue(2026-09-17) — 하루를 여는 브리핑 화면이라 해가 떠오르는 모양.
    case "sunrise":
      return (
        <svg {...shared} {...props}>
          <path d="M12 2v3" />
          <path d="M4.9 6.9 7 9" />
          <path d="M2 14h3" />
          <path d="M19 14h3" />
          <path d="m17 9 2.1-2.1" />
          <path d="M7 18a5 5 0 0 1 10 0z" />
          <path d="M4 22h16" />
        </svg>
      );
  }
}
