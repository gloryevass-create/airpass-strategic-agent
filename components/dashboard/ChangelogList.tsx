"use client";

import { useMemo } from "react";
import type { ChangelogEntry } from "@/lib/changelog";

function formatDateHeading(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}년 ${m}월`;
}

// 상단 이동 pill에는 연도가 매번 반복되면 번잡해서, 목록에 여러 해가 섞여
// 있을 때만 연도를 붙인다(대부분은 같은 해 안에서만 쌓이므로 "9월"처럼
// 짧게 보이는 게 기본).
function shortMonthLabel(monthKey: string, showYear: boolean): string {
  const [y, m] = monthKey.split("-").map(Number);
  return showYear ? `${y}년 ${m}월` : `${m}월`;
}

function sectionId(monthKey: string): string {
  return `changelog-${monthKey}`;
}

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  // 날짜별 항목(entries)을 월(YYYY-MM) 단위로 다시 묶는다 — CHANGELOG 자체는
  // 이미 날짜 내림차순으로 정렬돼 있으므로 그 순서를 그대로 유지한다.
  const months = useMemo(() => {
    const byMonth = new Map<string, ChangelogEntry[]>();
    for (const entry of entries) {
      const key = entry.date.slice(0, 7);
      const list = byMonth.get(key) ?? [];
      list.push(entry);
      byMonth.set(key, list);
    }
    return Array.from(byMonth.entries()).map(([monthKey, list]) => ({ monthKey, entries: list }));
  }, [entries]);

  const showYear = useMemo(() => new Set(months.map((m) => m.monthKey.slice(0, 4))).size > 1, [months]);

  function jumpTo(monthKey: string) {
    document.getElementById(sectionId(monthKey))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (months.length === 0) {
    return (
      <div className="rounded-sm border border-hairline bg-canvas-cream p-6 text-center text-sm text-ink-mute">
        아직 기록된 히스토리가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 상단 월 이동 바 — 최신 달이 왼쪽에 오도록 CHANGELOG 순서 그대로 나열하고,
          누르면 아래 해당 월 섹션으로 부드럽게 스크롤한다. */}
      <nav className="flex flex-wrap gap-2" aria-label="월별 이동">
        {months.map((m) => (
          <button
            key={m.monthKey}
            type="button"
            onClick={() => jumpTo(m.monthKey)}
            className="rounded-lg bg-canvas-cream px-3 py-1.5 text-xs font-medium text-ink-mute transition-colors hover:bg-hairline hover:text-ink"
          >
            {shortMonthLabel(m.monthKey, showYear)}
            <span className="ml-1 text-[10px] text-ink-mute/70">
              ({m.entries.reduce((sum, e) => sum + e.items.length, 0)})
            </span>
          </button>
        ))}
      </nav>

      <ol className="flex flex-col gap-8">
        {months.map((m) => (
          <li key={m.monthKey} id={sectionId(m.monthKey)} className="scroll-mt-6">
            <h2 className="mb-3 border-b border-hairline pb-2 text-base font-bold text-primary">
              {monthLabel(m.monthKey)}
            </h2>
            <ol className="flex flex-col gap-4">
              {m.entries.map((entry) => (
                <li key={entry.date} className="rounded-sm border border-hairline bg-canvas-cream p-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink">{formatDateHeading(entry.date)}</h3>
                  <ul className="flex flex-col gap-1.5">
                    {entry.items.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-ink-mute">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-mute" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
