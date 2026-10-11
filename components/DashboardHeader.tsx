"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NavIcon } from "@/components/icons/NavIcon";
import { NotificationBell } from "@/components/NotificationBell";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { AiCommandBar } from "@/components/dashboard/AiCommandBar";
import { useMobileNav } from "@/components/MobileNavContext";
import { formatMember } from "@/lib/formatMember";
import type { Notification } from "@/lib/queries/notifications";

export function DashboardHeader({
  email,
  name,
  title,
  isAdmin,
  userId,
  notifications,
  teamMembers,
}: {
  email: string;
  name: string | null;
  title: string | null;
  isAdmin: boolean;
  userId: string;
  notifications: Notification[];
  teamMembers: string[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toggle: toggleMobileNav } = useMobileNav();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-[#262b3a] px-4 py-4 print:hidden md:px-6">
      <div className="flex min-w-0 items-center gap-1 md:w-56 md:shrink-0 md:gap-2.5">
        <button
          type="button"
          onClick={toggleMobileNav}
          aria-label="메뉴 열기"
          className="flex h-8 w-8 shrink-0 items-center justify-center text-white/70 hover:text-white md:hidden"
        >
          <NavIcon name="menu" className="h-5 w-5" />
        </button>
        <Link href="/dashboard/calendar" className="flex min-w-0 shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Strategic Planning Team" className="-ml-3 h-10 w-auto" />
        </Link>
      </div>
      <div className="hidden flex-1 justify-center px-4 lg:flex">
        <AiCommandBar members={teamMembers} currentUserName={name ?? email} />
      </div>
      <div className="flex items-center gap-2 text-sm md:gap-4">
        <PushNotificationToggle />
        <NotificationBell initialNotifications={notifications} userId={userId} />
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-white/70 transition-colors md:px-3 ${
              menuOpen ? "border-white/40 text-white" : "border-transparent hover:border-white/20 hover:text-white"
            }`}
          >
            <NavIcon name="user" className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{formatMember(name, title, email)}</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[10rem] rounded-md border border-hairline bg-background py-1 shadow-lg">
              <Link
                href="/dashboard/account/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-canvas-cream"
              >
                <NavIcon name="user" className="h-3.5 w-3.5" />
                회원정보 수정
              </Link>
              <Link
                href="/dashboard/account/password"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-canvas-cream"
              >
                <NavIcon name="key" className="h-3.5 w-3.5" />
                비밀번호 변경
              </Link>
              {/* 명함첩은 본인만 보는 개인 데이터라 사이드바(팀 공용 메뉴)가 아니라
                  여기 개인 메뉴에 둔다(2026-10-11). */}
              <Link
                href="/dashboard/account/business-cards"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-canvas-cream"
              >
                <NavIcon name="receipt" className="h-3.5 w-3.5" />
                리멤버 명함
              </Link>
            </div>
          )}
        </div>
        {isAdmin && (
          <a
            href="/dashboard/admin"
            className="flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-white/70 transition-colors hover:border-white/20 hover:text-white md:px-3"
          >
            <NavIcon name="shield" className="h-3.5 w-3.5" />
            <span className="hidden md:inline">관리자</span>
          </a>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-white/70 transition-colors hover:border-white/20 hover:text-white md:px-3"
        >
          <NavIcon name="logout" className="h-3.5 w-3.5" />
          <span className="hidden md:inline">로그아웃</span>
        </button>
      </div>
    </header>
  );
}
