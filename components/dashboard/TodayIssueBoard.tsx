"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ISSUE_GROUP_LABEL,
  ISSUE_GROUP_ORDER,
  type DayIssues,
  type IssueGroup,
  type IssueItem,
  type TodayIssueData,
} from "@/lib/queries/todayIssue";

// Today Issue(2026-09-17) — 어제/오늘/내일을 탭으로 전환하는 브리핑 화면.
// 데이터는 3일치를 서버에서 한 번에 받아오므로(lib/queries/todayIssue.ts) 탭
// 전환은 여기서 상태만 바꾸면 끝이다 — 서버 왕복이 없어 즉시 반응한다.
//
// 표가 아니라 목록으로 그린다 — 항목마다 칸 수가 달라 표로 맞추면 빈 칸이
// 많아지고, 목록이면 industryTheme.css의 모바일 카드 변환 규칙 없이도 좁은
// 화면에서 자연히 세로로 쌓인다.

type TabKey = "yesterday" | "today" | "tomorrow";

const TABS: { key: TabKey; label: string }[] = [
  { key: "yesterday", label: "어제" },
  { key: "today", label: "오늘" },
  { key: "tomorrow", label: "내일" },
];

/** 버킷마다 제목과 "비어 있을 때" 문구가 다르다 — 내일 칸은 "변동"이 원래
 * 비어 있는 게 정상이라(아직 등록될 일이 없음) 문구를 따로 둔다. */
const SECTIONS: { key: keyof Omit<DayIssues, "dateStr">; label: string }[] = [
  { key: "scheduled", label: "일정" },
  { key: "deadlines", label: "기한" },
  { key: "activity", label: "변동" },
];

function dayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function generatedAtLabel(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 종류 배지 색 — "신규"만 강조하고 나머지는 차분하게 둔다(색이 많아지면
 * 무엇이 중요한지 안 보인다, 마케팅분석 차트 배색 원칙과 같은 취지). */
function kindTagClass(kind: string): string {
  if (kind === "신규") return "tag tag-accent";
  if (kind === "수정") return "tag tag-outline";
  return "tag tag-neutral";
}

function IssueRow({ item }: { item: IssueItem }) {
  const body = (
    <>
      <span className={kindTagClass(item.kind)} style={{ flex: "0 0 auto", fontSize: 11 }}>
        {item.kind}
      </span>
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>
        <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{item.title}</span>
        {item.detail && (
          <span className="text-muted" style={{ display: "block", fontSize: 12, overflowWrap: "anywhere" }}>
            {item.detail}
          </span>
        )}
      </span>
      {item.timeLabel && (
        <span className="text-muted" style={{ flex: "0 0 auto", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {item.timeLabel}
        </span>
      )}
    </>
  );

  const rowStyle = {
    display: "flex",
    alignItems: "baseline",
    gap: "var(--space-2)",
    padding: "6px 0",
    borderBottom: "1px solid var(--color-divider)",
    fontSize: 13,
  } as const;

  if (!item.link) return <div style={rowStyle}>{body}</div>;

  return (
    <Link href={item.link} style={{ ...rowStyle, color: "inherit", textDecoration: "none" }}>
      {body}
    </Link>
  );
}

function GroupBlock({ group, items }: { group: IssueGroup; items: IssueItem[] }) {
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <p
        style={{
          margin: "0 0 2px",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.55,
        }}
      >
        {ISSUE_GROUP_LABEL[group]} ({items.length})
      </p>
      {items.map((item) => (
        <IssueRow key={item.key} item={item} />
      ))}
    </div>
  );
}

function SectionBlock({
  label,
  items,
  emptyText,
}: {
  label: string;
  items: IssueItem[];
  emptyText: string;
}) {
  const byGroup = ISSUE_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="card" style={{ background: "#ffffff", borderRadius: 8, boxShadow: "var(--shadow-sm)" }}>
      <h2
        style={{
          margin: "0 0 var(--space-3)",
          fontFamily: "var(--font-heading)",
          fontSize: 14,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        {label}
        <span className="text-muted" style={{ fontSize: 12, fontWeight: 400 }}>
          {items.length}건
        </span>
      </h2>
      {byGroup.length === 0 ? (
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          {emptyText}
        </p>
      ) : (
        byGroup.map(({ group, items: groupItems }) => <GroupBlock key={group} group={group} items={groupItems} />)
      )}
    </section>
  );
}

export function TodayIssueBoard({ data }: { data: TodayIssueData }) {
  const [tab, setTab] = useState<TabKey>("today");
  const day = data[tab];
  const isFuture = tab === "tomorrow";

  const emptyTextFor = (key: keyof Omit<DayIssues, "dateStr">): string => {
    if (key === "activity") {
      return isFuture
        ? "내일 등록될 항목은 아직 없습니다 — 위의 일정과 기한을 확인하세요."
        : "등록·수정된 항목이 없습니다.";
    }
    if (key === "scheduled") return "등록된 일정이 없습니다.";
    return "마감·제출 기한이 없습니다.";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="seg" style={{ alignSelf: "flex-start" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`seg-opt${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
            // .seg의 바깥 테두리와 .seg-opt 사이 구분선만 쓰므로 버튼 기본
            // 테두리는 끈다(Calendar의 월/주/일 토글과 같은 관례).
            style={{ border: 0 }}
          >
            {t.label}
            <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>
              {data[t.key].scheduled.length + data[t.key].activity.length + data[t.key].deadlines.length}
            </span>
          </button>
        ))}
      </div>

      {data.briefing && (
        <section
          className="card"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 6%, #ffffff)",
            borderRadius: 8,
            borderLeft: "3px solid var(--color-accent)",
          }}
        >
          <p
            style={{
              margin: "0 0 var(--space-2)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.6,
            }}
          >
            AI 브리핑 · {generatedAtLabel(data.briefing.generatedAt)} 기준
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{data.briefing.summary}</p>
        </section>
      )}

      <div className="stats-strip" style={{ display: "flex", gap: "var(--space-4)", alignItems: "baseline" }}>
        <strong style={{ fontFamily: "var(--font-heading)", fontSize: 15 }}>{dayLabel(day.dateStr)}</strong>
        <span className="text-muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          일정 {day.scheduled.length} · 기한 {day.deadlines.length} · 변동 {day.activity.length}
        </span>
      </div>

      {SECTIONS.map((s) => (
        <SectionBlock key={s.key} label={s.label} items={day[s.key]} emptyText={emptyTextFor(s.key)} />
      ))}
    </div>
  );
}
