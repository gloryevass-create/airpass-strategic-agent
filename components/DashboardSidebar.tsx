"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { NavIcon, type IconName } from "@/components/icons/NavIcon";
import { useMobileNav } from "@/components/MobileNavContext";
import "./dashboardSidebarTheme.css";

type LeafItem = { href: string; label: string; icon: IconName; activePrefix?: string };
type GroupItem = { label: string; icon: IconName; children: LeafItem[] };

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// AI HUB는 AI Tools/AI Review/AI Issue 세 라우트를 탭으로 묶은 단일 사이드바
// 항목이라(2026-09-06, 사이드바 세로 길이를 줄이기 위해 그룹+자식 3개를 한 줄로
// 압축), href 하나만으로는 세 라우트 중 어디에 있든 활성 표시가 안 된다 —
// activePrefix가 있으면 그 접두사로 대신 판정한다.
function isItemActive(pathname: string | null, item: LeafItem): boolean {
  if (!pathname) return false;
  if (item.activePrefix) return pathname.startsWith(item.activePrefix);
  return isActivePath(pathname, item.href);
}

// WORKSPACE는 사용자가 Claude Design으로 만든 사이드바 디자인("관리자 페이지
// 메뉴 디자인")대로 접히지 않는 고정 상단 목록(브랜드 박스 아래 flat list)이고,
// 그 아래 GROUPS만 펼치기/접기가 있는 그룹이다(2026-08-28 — 이전에는 WORKSPACE도
// 다른 그룹처럼 접었다 폈다 할 수 있었는데, 이 디자인에서는 상단 고정 목록과
// 접이식 그룹을 구분해서 그린다).
const TOP_ITEMS: LeafItem[] = [
  // 하루를 여는 브리핑이라 맨 위에 둔다(2026-09-17) — 어제/오늘/내일의 일정·변동·기한을
  // 한 화면에 모은다.
  { href: "/dashboard/today-issue", label: "Today Issue", icon: "sunrise" },
  { href: "/dashboard/calendar", label: "Calendar", icon: "calendar" },
  { href: "/dashboard/business", label: "Business", icon: "briefcase" },
  { href: "/dashboard/cooperation", label: "Cooperation", icon: "share" },
  { href: "/dashboard/marketing-tasks", label: "Marketing", icon: "list" },
  { href: "/dashboard/todos", label: "To-Do", icon: "checkSquare" },
  { href: "/dashboard/memos", label: "Memo Board", icon: "clipboard" },
  { href: "/dashboard/work-journal", label: "Work Journal", icon: "chat" },
  { href: "/dashboard/meeting-notes", label: "Meeting Notes", icon: "document" },
  // AI Tools/AI Review/AI Issue 세 라우트를 한 항목으로 묶는다 — 각 페이지 상단
  // 탭(components/dashboard/AiHubTabs.tsx)으로 서로 이동한다(2026-09-06, 사이드바가
  // 너무 길어진다는 피드백으로 그룹+자식 3줄 대신 1줄로 압축).
  { href: "/dashboard/ai-tools", label: "AI HUB", icon: "sparkle", activePrefix: "/dashboard/ai-" },
];

const GROUPS: GroupItem[] = [
  {
    label: "영업지원",
    icon: "wallet",
    children: [
      { href: "/dashboard/product-catalog", label: "제품 카탈로그", icon: "tag" },
      { href: "/dashboard/vendors", label: "제조사 관리", icon: "wallet" },
      { href: "/dashboard/quotations", label: "산출내역 관리", icon: "receipt" },
      { href: "/dashboard/material-email", label: "자료메일발송", icon: "paperclip" },
    ],
  },
  {
    label: "마케팅분석",
    icon: "chart",
    children: [
      { href: "/dashboard/keywords", label: "네이버키워드", icon: "search" },
      { href: "/dashboard/blog", label: "네이버블로그", icon: "document" },
      { href: "/dashboard/youtube", label: "유튜브채널분석", icon: "play" },
    ],
  },
  {
    label: "모니터링",
    icon: "alert",
    children: [
      { href: "/dashboard/budget", label: "조달입찰공고", icon: "megaphone" },
      { href: "/dashboard/prespec", label: "조달사전규격", icon: "search" },
      { href: "/dashboard/news", label: "교육관련뉴스", icon: "newspaper" },
    ],
  },
  {
    label: "데이터베이스",
    icon: "list",
    children: [
      { href: "/dashboard/db/youth-facilities", label: "청소년관련기관", icon: "tag" },
      { href: "/dashboard/db/disability-organizations", label: "장애인관련기관", icon: "tag" },
      { href: "/dashboard/db/disability-sports", label: "장애인체육시설", icon: "tag" },
      { href: "/dashboard/db/disability-welfare", label: "장애인편의시설", icon: "tag" },
      { href: "/dashboard/db/special-schools", label: "특수학교현황", icon: "tag" },
      { href: "/dashboard/db/public-institutions", label: "공공기관정보", icon: "tag" },
      { href: "/dashboard/db/senior-welfare-facilities", label: "전국경로당현황", icon: "tag" },
    ],
  },
  {
    label: "menu backup",
    icon: "history",
    children: [{ href: "/dashboard/business2", label: "SI Business", icon: "briefcase" }],
  },
];

// 기본으로 접혀 있는 그룹 — "데이터베이스"는 자주 안 쓰는 참고용 공공 DB 목록,
// "menu backup"은 이전 디자인을 보관만 해두는 용도라 기본은 접힌 상태로 시작한다.
const DEFAULT_COLLAPSED_GROUPS = ["데이터베이스", "menu backup"];

function NavSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />;
}

function TopRow({ item, active, showLabel }: { item: LeafItem; active: boolean; showLabel: boolean }) {
  const { close } = useMobileNav();

  // 이미 열려있는 메뉴를 다시 클릭하면 Next.js Link는 같은 경로라 아무 반응이 없다
  // (편집 폼 등 화면에 남아있는 로컬 상태가 그대로 유지됨) — 이미 활성 상태인 메뉴는
  // 강제로 전체 새로고침해서 항상 그 메뉴의 초기 화면으로 돌아가게 한다.
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    close();
    if (active) {
      e.preventDefault();
      window.location.href = item.href;
    }
  }

  return (
    <Link
      href={item.href}
      onClick={handleClick}
      title={showLabel ? undefined : item.label}
      className={`ds-sidebar-row${active ? " active" : ""}${showLabel ? "" : " collapsed"}`}
    >
      <NavIcon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
      {showLabel && (
        <span className="flex flex-1 items-center justify-between gap-2">
          {item.label}
          <NavSpinner />
        </span>
      )}
    </Link>
  );
}

function SubRow({ item, active }: { item: LeafItem; active: boolean }) {
  const { close } = useMobileNav();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    close();
    if (active) {
      e.preventDefault();
      window.location.href = item.href;
    }
  }

  return (
    <Link href={item.href} onClick={handleClick} className={`ds-sidebar-subrow${active ? " active" : ""}`}>
      <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export function DashboardSidebar({
  latestDate,
  fontOverrideStyle,
}: {
  latestDate: string | null;
  // 사이드바 전용 개인 폰트 설정(profiles.sidebar_font_preference, 2026-09-08) —
  // app/dashboard/layout.tsx가 본문(--font-sans)과 별도로 계산해서 넘겨준다.
  // .ds-sidebar가 dashboardSidebarTheme.css에서 var(--font-sans, Pretendard)를
  // 참조하므로, 이 nav 루트에 --font-sans를 다시 덮어쓰면 본문과 다른 값이어도
  // 이 안에서만 우선 적용된다(CSS 변수는 더 안쪽에서 재선언하면 그 서브트리에서
  // 이긴다).
  fontOverrideStyle?: CSSProperties;
}) {
  const pathname = usePathname();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(DEFAULT_COLLAPSED_GROUPS));
  const [railCollapsed, setRailCollapsed] = useState(false);
  const { open, close } = useMobileNav();

  // 모바일에서 링크를 눌러 페이지가 바뀌면 드로어를 자동으로 닫는다(각 행의
  // onClick으로도 닫히지만, 그룹 헤더 클릭 없이 바로 이동하는 다른 경로 대비 안전망).
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // 레일이 접혀 있으면(아이콘만) 그룹은 항상 접힌 채로 보여준다 — 라벨이 안 보이는
  // 상태에서 하위 항목만 펼쳐지면 어떤 그룹인지 알 수 없기 때문(디자인 원본과
  // 동일한 동작).
  const showLabels = !railCollapsed;

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={close} aria-hidden="true" />}
      <nav
        className={`ds-sidebar fixed inset-y-0 left-0 z-40 flex h-full w-64 shrink-0 flex-col border-r border-hairline transition-transform duration-200 print:hidden md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${railCollapsed ? "md:w-[72px]" : "md:w-56"}`}
        style={fontOverrideStyle}
      >
        {/* WORKSPACE(브랜드 박스 + 상단 고정 목록)는 스크롤 없이 항상 그 자리에
            있고, 그 아래 접이식 그룹 목록만 자체 스크롤한다 — 디자인 원본과
            동일한 동작(사용자 확인, 2026-08-28). */}
        <div className="flex shrink-0 flex-col gap-1 p-2 pb-0">
          <div className="px-1 pb-2 pt-1">
            <div className={`ds-sidebar-brand${showLabels ? "" : " collapsed"}`}>
              <NavIcon
                name="sparkle"
                className="h-[18px] w-[18px] shrink-0 ds-sidebar-brand-sparkle"
                style={{ color: "var(--sb-accent-700)" }}
              />
              {showLabels && (
                <>
                  <span className="flex-1 text-[15px] font-bold tracking-wide" style={{ color: "var(--sb-accent-700)" }}>
                    WORKSPACE
                  </span>
                  <NavIcon name="chevron" className="h-3 w-3 rotate-90 shrink-0" style={{ color: "var(--sb-text-mute)" }} />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-0.5 px-1">
            {TOP_ITEMS.map((item) => (
              <TopRow key={item.href} item={item} active={isItemActive(pathname, item)} showLabel={showLabels} />
            ))}
          </div>

          {showLabels && <div className="ds-sidebar-divider" />}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 pt-1">
          <div className="flex flex-col gap-1 px-1">
            {GROUPS.map((group) => {
              const hasActiveChild = group.children.some((child) => isActivePath(pathname, child.href));
              const expanded = showLabels && (hasActiveChild || !collapsedGroups.has(group.label));
              return (
                <div key={group.label} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={expanded}
                    title={showLabels ? undefined : group.label}
                    className={`ds-sidebar-group-header${hasActiveChild ? " has-active" : ""}${showLabels ? "" : " collapsed"}`}
                  >
                    <NavIcon name={group.icon} className="h-[18px] w-[18px] shrink-0" />
                    {showLabels && (
                      <>
                        <span className="flex-1 text-left text-[15px]">{group.label}</span>
                        <NavIcon
                          name="chevron"
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                          style={{ color: "var(--sb-text-mute)" }}
                        />
                      </>
                    )}
                  </button>
                  {expanded && (
                    <div className="flex flex-col gap-0.5">
                      {group.children.map((child) => (
                        <SubRow key={child.href} item={child} active={isActivePath(pathname, child.href)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="ds-sidebar-footer">
          {showLabels && (
            <>
              <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--sb-text-mute)" }}>
                <NavIcon name="calendar" className="h-3.5 w-3.5 shrink-0" />
                {latestDate ? `최근 수집일: ${latestDate}` : "아직 수집된 데이터가 없습니다"}
              </p>
              <Link
                href="/dashboard/changelog"
                onClick={close}
                className="flex items-center gap-1.5 text-xs transition-colors"
                style={{
                  color: isActivePath(pathname, "/dashboard/changelog") ? "var(--sb-accent-700)" : "var(--sb-text-mute)",
                  fontWeight: isActivePath(pathname, "/dashboard/changelog") ? 600 : 400,
                }}
              >
                <NavIcon name="history" className="h-3.5 w-3.5 shrink-0" />
                업데이트 히스토리
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setRailCollapsed((v) => !v)}
            aria-label={railCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
            className={`ds-sidebar-collapse-btn hidden md:flex${railCollapsed ? " collapsed" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              {railCollapsed ? <path d="M12 9l3 3-3 3" /> : <path d="M14 9l-3 3 3 3" />}
            </svg>
          </button>
        </div>
      </nav>
    </>
  );
}
