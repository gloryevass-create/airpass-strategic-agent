"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NavIcon } from "@/components/icons/NavIcon";
import {
  markNotificationRead,
  markAllNotificationsRead,
  fetchMyNotifications,
} from "@/app/dashboard/actions/notifications";
import type { Notification, NotificationType } from "@/lib/queries/notifications";

const TYPE_LABEL: Record<NotificationType, string> = {
  event: "일정",
  business: "비즈니스",
  youtube: "유튜브",
  budget_low: "광고비",
  memo: "메모",
  budget_scrap: "입찰공고",
  prespec_scrap: "사전규격",
  news_scrap: "뉴스",
  cooperation: "협업",
  marketing: "마케팅",
  quotation: "산출내역",
  meeting_note: "미팅노트",
  ai_review: "AI Review",
  ai_tool: "AI 도구",
  work_journal: "업무일지",
  material_email: "자료메일",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

export function NotificationBell({
  initialNotifications,
}: {
  initialNotifications: Notification[];
  userId: string;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Realtime 웹소켓이 끊기거나 이벤트를 못 받는 경우에도 최신 상태가 보장되도록
  // 30초마다 서버에서 다시 가져온다(실측 확인, 2026-08-20: 구독은 SUBSCRIBED인데도
  // INSERT 이벤트가 안 오는 문제가 있었음 — realtime은 되면 더 빠를 뿐인 보너스로
  // 남겨두고, 이 폴링이 실질적인 전달을 보장한다). 서버가 이 사용자의 읽음 상태까지
  // 반영해서 돌려주므로 그대로 교체해도 안전하다.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMyNotifications()
        .then(setNotifications)
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // 팀 공유 알림 피드라 새 알림이 생기면(파이프라인 diff, 메모 작성, 스크랩 등) 화면을
  // 새로고침하지 않아도 실시간으로 뜬다(Supabase Realtime, 0026 마이그레이션에서
  // publication에 추가함) — 되면 폴링보다 빠르게 뜨는 보너스, 안 되도 위 폴링이 보완한다.
  // "새 알림이 왔다"는 신호로만 쓰고 항상 서버에서 통째로 다시 받아와 교체한다 —
  // payload 내용으로 직접 배열에 추가하면 폴링과 겹쳐 중복 표시되는 문제가 있었다
  // (실측 확인, 2026-08-20).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        fetchMyNotifications()
          .then(setNotifications)
          .catch(() => {});
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const unread = notifications.filter((n) => !n.isRead);

  function handleClickNotification(n: Notification) {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      markNotificationRead(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  function handleMarkAllRead() {
    const ids = unread.map((n) => n.id);
    if (ids.length === 0) return;
    setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
    markAllNotificationsRead(ids).catch(() => {});
  }

  function handleToggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) {
        // 열 때마다 최신 상태로 한 번 더 갱신 — 폴링 주기(30초) 사이에 열어도 최신을 본다.
        fetchMyNotifications()
          .then(setNotifications)
          .catch(() => {});
      }
      return next;
    });
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label="알림"
        className={`relative flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
          open ? "border-white/40 text-white" : "border-transparent text-white/70 hover:border-white/20 hover:text-white"
        }`}
      >
        <NavIcon name="bell" className="h-4 w-4" />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-semantic-error px-1 text-[10px] font-bold text-white">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        // 아이폰 Safari 같은 좁은 화면에서 이 버튼(bell)이 헤더 오른쪽 아이콘 묶음
        // (알림 켜기·프로필·관리자·로그아웃) 중 맨 왼쪽에 있다 보니, 버튼 기준
        // right-0(버튼 오른쪽 끝에 드롭다운 오른쪽 끝을 맞추고 왼쪽으로 폭 320px
        // 만큼 펼침)로는 화면 왼쪽 밖으로 잘려 나갔다(2026-09-15, 사용자 아이폰
        // 캡처 확인). 모바일에서는 버튼 위치와 무관하게 뷰포트 좌우에 16px
        // 여백만 두는 fixed 패널로 바꿔 절대 화면 밖으로 안 나가게 하고,
        // md 이상(공간이 충분한 화면)에서는 기존 버튼-기준 absolute 배치를
        // 그대로 유지한다.
        <div className="fixed inset-x-4 top-[77px] z-20 flex max-h-[28rem] flex-col overflow-hidden rounded-md border border-hairline bg-background shadow-lg md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-1 md:w-80">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="text-sm font-semibold text-ink">알림</span>
            {unread.length > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-link-blue hover:underline">
                모두 읽음
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-mute">알림이 없습니다.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickNotification(n)}
                  className={`flex w-full flex-col gap-1 border-b border-hairline px-3 py-2.5 text-left last:border-b-0 hover:bg-canvas-cream ${
                    n.isRead ? "" : "bg-canvas-lavender/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="rounded bg-canvas-lavender px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {TYPE_LABEL[n.type]}
                      </span>
                      {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-semantic-error" />}
                    </span>
                    <span className="text-[11px] text-ink-mute">{relativeTime(n.createdAt)}</span>
                  </div>
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  {n.message && <p className="text-xs text-ink-mute">{n.message}</p>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
