// Supabase Storage 오브젝트 키에 한글(비ASCII) 문자가 들어가면 "Invalid key"로
// 거부된다는 걸 구글드라이브→Storage 재이전 작업 중 실측으로 확인했다
// (2026-09-07) — encodeURIComponent로 퍼센트 인코딩해도 클라이언트/백엔드가
// 디코딩한 뒤 다시 검사해서 소용없다. 그래서 원본 파일명은 DB 컬럼
// (file_name/original_name)에만 남기고, 실제 Storage 키에는 확장자만
// 살리고 나머지는 UUID로 만든다.
//
// randomUUID는 node:crypto가 아니라 표준 Web Crypto(globalThis.crypto)에서
// 가져온다(2026-09-29) — Work Journal이 브라우저에서 Storage로 직접 업로드하게
// 되면서 이 함수가 클라이언트 번들에도 들어가야 했고, node:crypto를 import하면
// 거기서 빌드가 깨지기 때문. Node 19+와 모든 최신 브라우저(보안 컨텍스트)에
// 있으므로 동작은 이전과 같다.
export function safeStorageFileName(originalName: string): string {
  const ext = originalName.match(/\.[^./\\]+$/)?.[0] ?? "";
  return `${globalThis.crypto.randomUUID()}${ext}`;
}
