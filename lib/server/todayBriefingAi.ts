import "server-only";
import { ISSUE_GROUP_LABEL, type DayIssues, type TodayIssueData } from "@/lib/queries/todayIssue";

// Today Issue(2026-09-17) 상단 AI 브리핑 문장 생성 — lib/server/aiIssueSelection.ts /
// lib/newsHotKeywordsAi.ts와 같은 방식(fetch로 Claude Messages API 직접 호출 +
// tool_use로 구조화된 응답). 이 프로젝트엔 @anthropic-ai/sdk 의존성이 없다.
//
// 이 함수에 들어오는 데이터에는 개인 할 일이 없어야 한다 — 호출부(크론)가
// getTodayIssues(..., { includePersonalTodos: false })로 만든 데이터를 넘긴다
// (그 옵션 주석 참고).
export const TODAY_BRIEFING_MODEL = "claude-haiku-4-5-20251001";

/** 한 날짜의 항목들을 프롬프트에 넣을 텍스트로 만든다. 모델이 지어내지 않도록
 * 실제 항목만 그대로 나열한다(요약은 이 목록 안에서만 나와야 한다). */
function dayToText(label: string, day: DayIssues): string {
  const lines: string[] = [];
  const push = (sectionLabel: string, items: DayIssues["scheduled"]) => {
    if (items.length === 0) return;
    lines.push(`  [${sectionLabel}]`);
    for (const item of items) {
      const group = ISSUE_GROUP_LABEL[item.group];
      const time = item.timeLabel ? `${item.timeLabel} ` : "";
      const detail = item.detail ? ` — ${item.detail}` : "";
      lines.push(`  - ${time}(${group}/${item.kind}) ${item.title}${detail}`);
    }
  };
  push("일정", day.scheduled);
  push("기한", day.deadlines);
  push("변동", day.activity);

  if (lines.length === 0) return `${label} (${day.dateStr}): 없음`;
  return `${label} (${day.dateStr}):\n${lines.join("\n")}`;
}

/** 어제·오늘·내일 항목을 보고 한국어 브리핑 문장을 만든다.
 * 실패는 호출부(크론)가 처리한다 — 요약이 없어도 화면은 목록만으로 동작한다. */
export async function buildTodayBriefing(data: TodayIssueData): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

  const totalItems =
    data.yesterday.scheduled.length +
    data.yesterday.activity.length +
    data.yesterday.deadlines.length +
    data.today.scheduled.length +
    data.today.activity.length +
    data.today.deadlines.length +
    data.tomorrow.scheduled.length +
    data.tomorrow.activity.length +
    data.tomorrow.deadlines.length;

  // 항목이 아예 없으면 모델을 부르지 않는다 — "없습니다"를 AI로 만들 이유가 없다.
  if (totalItems === 0) return null;

  const listText = [
    dayToText("어제", data.yesterday),
    dayToText("오늘", data.today),
    dayToText("내일", data.tomorrow),
  ].join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TODAY_BRIEFING_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content:
            `아래는 에어패스 전략기획팀 업무 대시보드에서 뽑은 어제·오늘·내일의 일정/기한/변동 목록입니다. ` +
            `write_briefing 도구로 팀원이 아침에 읽을 브리핑을 한국어로 작성하세요.\n\n` +
            `규칙:\n` +
            `- 3~5문장, 평서문. "어제는 …, 오늘은 …, 내일은 …" 흐름으로 쓰세요.\n` +
            `- **목록에 없는 내용은 절대 지어내지 마세요.** 건수나 이름을 추측하지 말고 목록에 있는 것만 쓰세요.\n` +
            `- 놓치면 곤란한 것(마감·제출·발표·의견마감 기한, 외부 미팅, 메일 발송)을 우선 언급하세요.\n` +
            `- 단순 등록·수정이 많을 때는 "SI Business 3건 수정" 같이 묶어서 쓰고 하나하나 나열하지 마세요.\n` +
            `- 항목이 적으면 짧게 쓰고, 억지로 길이를 늘리지 마세요.\n` +
            `- 인사말("안녕하세요")이나 맺음말("좋은 하루 되세요")은 넣지 마세요.\n\n` +
            listText,
        },
      ],
      tools: [
        {
          name: "write_briefing",
          description: "어제·오늘·내일 업무 목록을 바탕으로 팀 브리핑 문장을 작성한다.",
          input_schema: {
            type: "object",
            properties: {
              briefing: { type: "string", description: "한국어 브리핑 3~5문장" },
            },
            required: ["briefing"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "write_briefing" },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`브리핑 생성 실패 (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    content?: { type: string; input?: { briefing?: unknown } }[];
  };
  const toolUse = payload.content?.find((block) => block.type === "tool_use");
  const briefing = toolUse?.input?.briefing;
  if (typeof briefing !== "string" || !briefing.trim()) {
    throw new Error("브리핑 응답 형식이 올바르지 않습니다.");
  }

  return briefing.trim();
}
