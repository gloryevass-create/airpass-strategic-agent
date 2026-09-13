import "server-only";
import { randomBytes, createHash } from "crypto";

// 외부 에이전트(Claude 등)가 Authorization: Bearer로 보내는 개인 API 토큰.
// 그대로 흘러들어오는 값이라 SMTP 비밀번호/OAuth refresh_token과 달리 DB에는
// sha256 해시만 저장하고, 평문은 발급 시점(createApiToken)에 딱 한 번만
// 돌려준다 — 이후로는 DB에서도 다시 복원할 수 없다(흔한 API 키 UX).
const PREFIX = "aps_";

export function generateApiToken(): { token: string; hash: string; preview: string } {
  const token = `${PREFIX}${randomBytes(24).toString("hex")}`;
  return { token, hash: hashApiToken(token), preview: tokenPreview(token) };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenPreview(token: string): string {
  return `${token.slice(0, PREFIX.length + 6)}...${token.slice(-4)}`;
}
