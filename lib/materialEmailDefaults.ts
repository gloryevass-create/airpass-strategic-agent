// 클라이언트(MaterialEmailForm)와 서버(AI 자동발송 액션) 양쪽에서 같은 기본
// 제목·안내문을 써야 해서 공용 파일로 분리했다(사용자 확인, 2026-08-26).
export const DEFAULT_MATERIAL_EMAIL_SUBJECT = "[에어패스] 제품군 브로셔 및 소개 영상 자료 송부의 건";

export const DEFAULT_MATERIAL_EMAIL_MESSAGE = `안녕하세요, 에어패스입니다.

요청하신 에어패스 제품군의 브로셔와 소개 영상 자료를 첨부하여 전달드립니다.

전달해 드린 자료를 검토해 보시고 추가로 궁금하신 사항이나 상담이 필요하신 경우, 언제든지 이메일 또는 전화로 연락해 주시면 친절하고 자세하게 안내해 드리겠습니다.

감사합니다.

에어패스 드림`;

// 본문 맨 끝 맺음말 — 푸터와 같은 이유로 폼 입력란으로 뺐다(2026-09-14).
// 서명은 마지막 줄만 굵게 나온다(기존 "감사합니다. / **주식회사 에어패스**" 모양
// 그대로 — 폼 안내문에도 그렇게 적어뒀다).
export const DEFAULT_MATERIAL_EMAIL_CLOSING =
  "검토 중 궁금하신 사항이나 추가로 필요하신 자료가 있으시면 편하게 말씀 부탁드립니다.";
export const DEFAULT_MATERIAL_EMAIL_SIGNOFF = "감사합니다.\n주식회사 에어패스";

// 메일 하단 푸터(홈페이지·유튜브·회사주소) — 원래 템플릿에 하드코딩돼 있었는데,
// 발송할 때마다 고칠 수 있어야 한다는 요청(2026-09-14)으로 폼 입력란으로 빼면서
// 그 기본값만 여기로 옮겼다. 제목·안내문과 같은 이유로 클라이언트(폼 초기값)와
// 서버(AI 자동발송·이력 미리보기) 양쪽이 함께 참조한다.
export const DEFAULT_MATERIAL_EMAIL_HOMEPAGE = "www.airpass.co.kr";
export const DEFAULT_MATERIAL_EMAIL_YOUTUBE = "@AIRPASS_XR";
export const DEFAULT_MATERIAL_EMAIL_ADDRESS =
  "경기도 하남시 하남대로 947(풍산동, 하남 테크노밸리 U1CENTER) D동 15층";
